-- Open amounts and due dates (step 10): every debt on a customer's or
-- supplier's account (a charge, or an adjustment up) keeps how much of it is
-- still unpaid and when it is due. aimify_settle keeps the open amounts adding
-- up to the balance by settling the oldest debts first whenever a payment or
-- credit arrives, and marks the sales and purchases it settles as paid.
-- aimify_record_credit records a ledger entry in one step (the API used to do
-- it in several statements). The sale and purchase functions are redefined to
-- keep open amounts and due dates, and to lock the customer or supplier
-- before the sale or purchase, so two of them never wait on each other.

CREATE OR REPLACE FUNCTION aimify_settle(
  p_org uuid,
  p_type text,
  p_party uuid,
  p_source uuid,
  p_user uuid
) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  current_balance numeric;
  open_total numeric;
  excess numeric;
  take numeric;
  debit record;
  src credit_entries%ROWTYPE;
  note_text text;
  allocations jsonb := '[]'::jsonb;
  doc_ref text;
BEGIN
  IF p_type = 'customer' THEN
    SELECT balance INTO current_balance FROM customers WHERE id = p_party AND "organizationId" = p_org;
  ELSE
    SELECT balance INTO current_balance FROM suppliers WHERE id = p_party AND "organizationId" = p_org;
  END IF;

  SELECT coalesce(sum("openAmount"), 0) INTO open_total FROM credit_entries
    WHERE "organizationId" = p_org AND "partyType" = p_type AND "partyId" = p_party AND "openAmount" > 0;
  excess := round(open_total - greatest(coalesce(current_balance, 0), 0), 2);
  IF excess <= 0 THEN
    RETURN allocations;
  END IF;

  IF p_source IS NOT NULL THEN
    SELECT * INTO src FROM credit_entries WHERE id = p_source;
  END IF;
  note_text := CASE
    WHEN src."receiptNumber" IS NOT NULL THEN 'Paid on account (' || src."receiptNumber" || ')'
    WHEN src.kind = 'payment' THEN 'Paid on account'
    ELSE 'Settled from account credit'
  END;

  FOR debit IN
    SELECT id, "openAmount", "saleId", "purchaseId" FROM credit_entries
    WHERE "organizationId" = p_org AND "partyType" = p_type AND "partyId" = p_party AND "openAmount" > 0
    ORDER BY "dueDate" NULLS LAST, "createdAt", id
    FOR UPDATE
  LOOP
    EXIT WHEN excess <= 0;
    take := least(debit."openAmount", excess);
    UPDATE credit_entries SET "openAmount" = "openAmount" - take WHERE id = debit.id;
    INSERT INTO credit_allocations ("organizationId", "creditEntryId", "debitEntryId", amount)
      VALUES (p_org, p_source, debit.id, take);
    doc_ref := NULL;
    IF debit."saleId" IS NOT NULL THEN
      UPDATE sales SET "amountPaid" = "amountPaid" + take, "updatedAt" = now()
        WHERE id = debit."saleId" RETURNING reference INTO doc_ref;
      INSERT INTO sale_payments ("organizationId", "saleId", amount, method, note, "userId", "creditEntryId")
        VALUES (p_org, debit."saleId", take, coalesce(src.method, 'other'), note_text, p_user, p_source);
    ELSIF debit."purchaseId" IS NOT NULL THEN
      UPDATE purchases SET "amountPaid" = "amountPaid" + take, "updatedAt" = now()
        WHERE id = debit."purchaseId" RETURNING reference INTO doc_ref;
      INSERT INTO purchase_payments ("organizationId", "purchaseId", amount, note, "userId", "creditEntryId")
        VALUES (p_org, debit."purchaseId", take, note_text, p_user, p_source);
    END IF;
    allocations := allocations || jsonb_build_object(
      'debitEntryId', debit.id, 'saleId', debit."saleId", 'purchaseId', debit."purchaseId",
      'reference', doc_ref, 'amount', take
    );
    excess := excess - take;
  END LOOP;

  RETURN allocations;
END;
$$;
--> statement-breakpoint
-- One entry on a customer's or supplier's account, all in one step: a retry
-- with the same clientRef returns the first; a payment can't take the
-- balance below zero; a debt gets its due date (charges: the party's
-- payment terms; adjustments up: now); a customer's payment on account gets
-- the next receipt number; then payments and credits settle the oldest debts.
CREATE OR REPLACE FUNCTION aimify_record_credit(
  p_org uuid,
  p_user uuid,
  p_type text,
  p_party uuid,
  p_kind text,
  p_amount numeric,
  p_note text,
  p_method text,
  p_client_ref text
) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  signed numeric;
  current_balance numeric;
  terms integer;
  entry_id uuid;
  existing uuid;
  receipt text;
  seq integer;
  allocations jsonb;
BEGIN
  IF p_client_ref IS NOT NULL THEN
    SELECT id INTO existing FROM credit_entries WHERE "organizationId" = p_org AND "clientRef" = p_client_ref;
    IF FOUND THEN
      RETURN jsonb_build_object('duplicate', true, 'entryId', existing);
    END IF;
  END IF;

  IF p_type = 'customer' THEN
    SELECT balance, "paymentTermsDays" INTO current_balance, terms FROM customers
      WHERE id = p_party AND "organizationId" = p_org FOR UPDATE;
  ELSE
    SELECT balance, "paymentTermsDays" INTO current_balance, terms FROM suppliers
      WHERE id = p_party AND "organizationId" = p_org FOR UPDATE;
  END IF;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'party_not_found';
  END IF;

  signed := CASE p_kind
    WHEN 'charge' THEN round(abs(p_amount), 2)
    WHEN 'payment' THEN -round(abs(p_amount), 2)
    ELSE round(p_amount, 2)
  END;

  IF p_kind = 'payment' AND current_balance + signed < 0 THEN
    RAISE EXCEPTION 'overpayment' USING DETAIL = jsonb_build_object('balanceOwed', round(current_balance, 2))::text;
  END IF;

  IF p_type = 'customer' THEN
    UPDATE customers SET balance = balance + signed, "updatedAt" = now() WHERE id = p_party;
  ELSE
    UPDATE suppliers SET balance = balance + signed, "updatedAt" = now() WHERE id = p_party;
  END IF;

  IF p_type = 'customer' AND p_kind = 'payment' THEN
    UPDATE organizations SET "receiptSeq" = "receiptSeq" + 1 WHERE id = p_org RETURNING "receiptSeq" INTO seq;
    receipt := 'RCPT-' || CASE WHEN seq < 10000 THEN lpad(seq::text, 4, '0') ELSE seq::text END;
  END IF;

  INSERT INTO credit_entries (
    "organizationId", "partyType", "partyId", kind, amount, note, "userId", "clientRef",
    "openAmount", "dueDate", method, "receiptNumber"
  ) VALUES (
    p_org, p_type, p_party, p_kind, signed, nullif(p_note, ''), p_user, p_client_ref,
    greatest(signed, 0),
    CASE WHEN signed <= 0 THEN NULL
         WHEN p_kind = 'charge' THEN now() + make_interval(days => terms)
         ELSE now() END,
    CASE WHEN p_kind = 'payment' THEN coalesce(nullif(p_method, ''), 'cash') END,
    receipt
  ) RETURNING id INTO entry_id;

  allocations := aimify_settle(p_org, p_type, p_party, CASE WHEN signed < 0 THEN entry_id END, p_user);

  RETURN jsonb_build_object(
    'duplicate', false,
    'entryId', entry_id,
    'previousBalance', round(current_balance, 2),
    'balanceOwed', round(current_balance + signed, 2),
    'receiptNumber', receipt,
    'allocations', allocations
  );
END;
$$;
--> statement-breakpoint
-- Recording a sale, in one all-or-nothing step: its number, the sale and
-- its lines, each product leaving the chosen warehouse (never below zero),
-- the stock movement ledger, any payment taken at the counter, and the
-- customer's account. Products are locked in id order so two sales of the
-- same products at once can neither deadlock nor oversell. Problems are
-- raised as exceptions whose message is a code the API turns into a
-- response.
CREATE OR REPLACE FUNCTION aimify_create_sale(
  p_org uuid,
  p_user uuid,
  p_sale jsonb,
  p_lines jsonb,
  p_allow_over_limit boolean
) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  sale_id uuid := (p_sale->>'id')::uuid;
  customer_id uuid := nullif(p_sale->>'customerId', '')::uuid;
  warehouse_id uuid := (p_sale->>'warehouseId')::uuid;
  client_ref text := nullif(p_sale->>'clientRef', '');
  total numeric := round((p_sale->>'total')::numeric, 2);
  paid numeric := round(coalesce((p_sale->>'amountPaid')::numeric, 0), 2);
  unpaid numeric;
  cust customers%ROWTYPE;
  over_limit boolean := false;
  seq integer;
  ref text;
  item record;
  prod products%ROWTYPE;
  available integer;
  held integer;
  stock_info jsonb := '[]'::jsonb;
  existing uuid;
  sale_date timestamp := coalesce((p_sale->>'saleDate')::timestamp, now());
  due timestamp;
BEGIN
  IF client_ref IS NOT NULL THEN
    SELECT id INTO existing FROM sales WHERE "organizationId" = p_org AND "clientRef" = client_ref;
    IF FOUND THEN
      RETURN jsonb_build_object('duplicate', true, 'saleId', existing);
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM warehouses WHERE id = warehouse_id AND "organizationId" = p_org AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'warehouse_inactive';
  END IF;

  IF paid > total THEN
    RAISE EXCEPTION 'overpayment' USING DETAIL = jsonb_build_object('remaining', total)::text;
  END IF;
  unpaid := total - paid;

  IF customer_id IS NULL THEN
    IF unpaid > 0 THEN
      RAISE EXCEPTION 'walk_in_must_pay' USING DETAIL = jsonb_build_object('unpaid', unpaid)::text;
    END IF;
  ELSE
    SELECT * INTO cust FROM customers WHERE id = customer_id AND "organizationId" = p_org FOR UPDATE;
    IF NOT FOUND OR cust.status = 'archived' THEN
      RAISE EXCEPTION 'invalid_customer';
    END IF;
    IF unpaid > 0 AND cust."creditLimit" > 0 AND cust.balance + unpaid > cust."creditLimit" THEN
      IF NOT p_allow_over_limit THEN
        RAISE EXCEPTION 'over_credit_limit' USING DETAIL = jsonb_build_object(
          'creditLimit', cust."creditLimit",
          'balance', cust.balance,
          'available', greatest(cust."creditLimit" - cust.balance, 0),
          'unpaid', unpaid
        )::text;
      END IF;
      over_limit := true;
    END IF;
  END IF;

  UPDATE organizations SET "saleSeq" = "saleSeq" + 1 WHERE id = p_org RETURNING "saleSeq" INTO seq;
  ref := 'INV-' || CASE WHEN seq < 10000 THEN lpad(seq::text, 4, '0') ELSE seq::text END;

  INSERT INTO sales (
    id, "organizationId", number, reference, "customerId", "warehouseId", status, "saleDate", notes,
    subtotal, discount, tax, total, "amountPaid", "overLimitApprovedBy", "createdBy", "clientRef"
  ) VALUES (
    sale_id, p_org, seq, ref, customer_id, warehouse_id, 'completed',
    sale_date, nullif(p_sale->>'notes', ''),
    round((p_sale->>'subtotal')::numeric, 2), round(coalesce((p_sale->>'discount')::numeric, 0), 2),
    round(coalesce((p_sale->>'tax')::numeric, 0), 2), total, paid,
    CASE WHEN over_limit THEN p_user ELSE NULL END, p_user, client_ref
  );

  FOR item IN
    SELECT * FROM jsonb_to_recordset(p_lines)
      AS x("productId" uuid, quantity integer, "unitPrice" numeric, position integer)
    ORDER BY x."productId", x.position
  LOOP
    IF item.quantity IS NULL OR item.quantity <= 0 THEN
      RAISE EXCEPTION 'invalid_quantity';
    END IF;

    SELECT * INTO prod FROM products WHERE id = item."productId" AND "organizationId" = p_org FOR UPDATE;
    IF NOT FOUND OR prod.status = 'archived' THEN
      RAISE EXCEPTION 'invalid_product' USING DETAIL = jsonb_build_object('productId', item."productId")::text;
    END IF;

    SELECT quantity INTO available FROM product_stock
      WHERE "productId" = item."productId" AND "warehouseId" = warehouse_id
      FOR UPDATE;
    available := coalesce(available, 0);
    IF available < item.quantity THEN
      RAISE EXCEPTION 'insufficient_stock' USING DETAIL = jsonb_build_object(
        'productId', item."productId",
        'name', prod.name,
        'available', available
      )::text;
    END IF;

    UPDATE product_stock SET quantity = quantity - item.quantity, "updatedAt" = now()
      WHERE "productId" = item."productId" AND "warehouseId" = warehouse_id
      RETURNING quantity INTO held;

    UPDATE products SET "currentStock" = "currentStock" - item.quantity, "updatedAt" = now()
      WHERE id = item."productId";

    stock_info := stock_info || jsonb_build_object(
      'productId', prod.id, 'name', prod.name, 'sku', prod.sku,
      'previousTotal', prod."currentStock", 'newTotal', prod."currentStock" - item.quantity,
      'minStock', prod."minStock"
    );

    INSERT INTO sale_lines (
      "organizationId", "saleId", "productId", position, quantity, "unitPrice", "listPrice", "unitCost"
    ) VALUES (
      p_org, sale_id, item."productId", coalesce(item.position, 0), item.quantity,
      round(item."unitPrice", 2), prod."sellingPrice", prod."purchasePrice"
    );

    INSERT INTO stock_movements (
      "organizationId", "warehouseId", "productId", "userId", type, quantity, reason,
      "previousStock", "newStock", "saleId"
    ) VALUES (
      p_org, warehouse_id, item."productId", p_user, 'stock_out', -item.quantity, 'Sold on ' || ref,
      held + item.quantity, held, sale_id
    );
  END LOOP;

  IF paid > 0 THEN
    INSERT INTO sale_payments ("organizationId", "saleId", amount, method, note, "userId")
      VALUES (p_org, sale_id, paid, coalesce(nullif(p_sale->>'paymentMethod', ''), 'cash'), 'Paid at the sale', p_user);
  END IF;

  -- A named customer's account shows the sale and what was paid on it, so
  -- their statement tells the whole story even for cash sales.
  IF customer_id IS NOT NULL THEN
    due := sale_date + make_interval(days => cust."paymentTermsDays");
    UPDATE sales SET "dueDate" = due WHERE id = sale_id;
  END IF;
  IF customer_id IS NOT NULL AND total > 0 THEN
    UPDATE customers SET balance = balance + total - paid, "updatedAt" = now() WHERE id = customer_id;
    INSERT INTO credit_entries (
      "organizationId", "partyType", "partyId", kind, amount, note, "userId", "saleId", "openAmount", "dueDate"
    ) VALUES (p_org, 'customer', customer_id, 'charge', total, 'Sale ' || ref, p_user, sale_id, total - paid, due);
    IF paid > 0 THEN
      INSERT INTO credit_entries ("organizationId", "partyType", "partyId", kind, amount, note, "userId", "saleId", method)
        VALUES (p_org, 'customer', customer_id, 'payment', -paid, 'Paid on sale ' || ref, p_user, sale_id,
                coalesce(nullif(p_sale->>'paymentMethod', ''), 'cash'));
    END IF;
    PERFORM aimify_settle(p_org, 'customer', customer_id, NULL, p_user);
  END IF;

  RETURN jsonb_build_object(
    'duplicate', false,
    'saleId', sale_id,
    'reference', ref,
    'overLimit', over_limit,
    'stock', stock_info
  );
END;
$$;
--> statement-breakpoint
-- A later payment against a sale's balance: also a payment on the
-- customer's account. A sale can't be paid beyond its total.
CREATE OR REPLACE FUNCTION aimify_pay_sale(
  p_org uuid,
  p_sale uuid,
  p_user uuid,
  p_amount numeric,
  p_method text,
  p_note text,
  p_client_ref text
) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  s sales%ROWTYPE;
  amount numeric := round(p_amount, 2);
  payment_id uuid;
  existing uuid;
BEGIN
  IF p_client_ref IS NOT NULL THEN
    SELECT "saleId" INTO existing FROM sale_payments WHERE "organizationId" = p_org AND "clientRef" = p_client_ref;
    IF FOUND THEN
      RETURN jsonb_build_object('duplicate', true, 'saleId', existing);
    END IF;
  END IF;

  PERFORM 1 FROM customers
    WHERE id = (SELECT "customerId" FROM sales WHERE id = p_sale AND "organizationId" = p_org)
    FOR UPDATE;
  SELECT * INTO s FROM sales WHERE id = p_sale AND "organizationId" = p_org FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'sale_not_found';
  END IF;
  IF s.status = 'voided' THEN
    RAISE EXCEPTION 'sale_voided';
  END IF;
  IF amount IS NULL OR amount <= 0 THEN
    RAISE EXCEPTION 'invalid_amount';
  END IF;
  IF s."amountPaid" + amount > s.total THEN
    RAISE EXCEPTION 'overpayment' USING DETAIL = jsonb_build_object('remaining', s.total - s."amountPaid")::text;
  END IF;

  INSERT INTO sale_payments ("organizationId", "saleId", amount, method, note, "userId", "clientRef")
    VALUES (p_org, p_sale, amount, coalesce(nullif(p_method, ''), 'cash'), p_note, p_user, p_client_ref)
    RETURNING id INTO payment_id;

  UPDATE sales SET "amountPaid" = "amountPaid" + amount, "updatedAt" = now() WHERE id = p_sale;

  IF s."customerId" IS NOT NULL THEN
    UPDATE customers SET balance = balance - amount, "updatedAt" = now() WHERE id = s."customerId";
    INSERT INTO credit_entries ("organizationId", "partyType", "partyId", kind, amount, note, "userId", "saleId", method)
      VALUES (p_org, 'customer', s."customerId", 'payment', -amount,
              coalesce(nullif(p_note, ''), 'Paid on sale ' || s.reference), p_user, p_sale,
              coalesce(nullif(p_method, ''), 'cash'));
    UPDATE credit_entries SET "openAmount" = greatest("openAmount" - round(p_amount, 2), 0)
      WHERE "saleId" = p_sale AND kind = 'charge';
    PERFORM aimify_settle(p_org, 'customer', s."customerId", NULL, p_user);
  END IF;

  RETURN jsonb_build_object('duplicate', false, 'saleId', p_sale, 'paymentId', payment_id,
                            'amountPaid', s."amountPaid" + amount);
END;
$$;
--> statement-breakpoint
-- Voiding a sale recorded by mistake: every line's stock goes back to the
-- warehouse it left, and the sale comes off the customer's account. Money
-- already paid stays on the account as a credit (owed back to them).
CREATE OR REPLACE FUNCTION aimify_void_sale(
  p_org uuid,
  p_sale uuid,
  p_user uuid,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  s sales%ROWTYPE;
  line record;
  held integer;
  adjustment_id uuid;
  balance_after numeric;
  refund numeric;
BEGIN
  PERFORM 1 FROM customers
    WHERE id = (SELECT "customerId" FROM sales WHERE id = p_sale AND "organizationId" = p_org)
    FOR UPDATE;
  SELECT * INTO s FROM sales WHERE id = p_sale AND "organizationId" = p_org FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'sale_not_found';
  END IF;
  IF s.status <> 'completed' THEN
    RAISE EXCEPTION 'sale_not_voidable';
  END IF;

  FOR line IN
    SELECT "productId", sum(quantity)::integer AS quantity FROM sale_lines
    WHERE "saleId" = p_sale GROUP BY "productId" ORDER BY "productId"
  LOOP
    PERFORM 1 FROM products WHERE id = line."productId" FOR UPDATE;

    INSERT INTO product_stock ("organizationId", "productId", "warehouseId", quantity)
      VALUES (p_org, line."productId", s."warehouseId", line.quantity)
      ON CONFLICT ("productId", "warehouseId") DO UPDATE
        SET quantity = product_stock.quantity + EXCLUDED.quantity, "updatedAt" = now()
      RETURNING quantity INTO held;

    UPDATE products SET "currentStock" = "currentStock" + line.quantity, "updatedAt" = now()
      WHERE id = line."productId";

    INSERT INTO stock_movements (
      "organizationId", "warehouseId", "productId", "userId", type, quantity, reason,
      "previousStock", "newStock", "saleId"
    ) VALUES (
      p_org, s."warehouseId", line."productId", p_user, 'stock_in', line.quantity,
      'Voided ' || s.reference, held - line.quantity, held, p_sale
    );
  END LOOP;

  UPDATE sales
    SET status = 'voided', "voidedAt" = now(), "voidedBy" = p_user, "voidReason" = p_reason, "updatedAt" = now()
    WHERE id = p_sale;

  refund := s."amountPaid";
  IF s."customerId" IS NOT NULL AND s.total > 0 THEN
    UPDATE customers SET balance = balance - s.total, "updatedAt" = now() WHERE id = s."customerId"
      RETURNING balance INTO balance_after;
    UPDATE credit_entries SET "openAmount" = 0 WHERE "saleId" = p_sale AND kind = 'charge';
    INSERT INTO credit_entries ("organizationId", "partyType", "partyId", kind, amount, note, "userId", "saleId")
      VALUES (p_org, 'customer', s."customerId", 'adjustment', -s.total,
              'Voided sale ' || s.reference || coalesce(' — ' || nullif(p_reason, ''), ''), p_user, p_sale)
      RETURNING id INTO adjustment_id;
    PERFORM aimify_settle(p_org, 'customer', s."customerId", adjustment_id, p_user);
    refund := least(s."amountPaid", greatest(-balance_after, 0));
  END IF;

  RETURN jsonb_build_object('saleId', p_sale, 'status', 'voided', 'refundOwed', refund,
                            'creditedToAccount', s."amountPaid" - refund);
END;
$$;

--> statement-breakpoint
-- Receiving a delivery against a purchase, in one all-or-nothing step: the
-- lines' received quantities, each warehouse balance and product total, the
-- stock movement ledger, the product's latest purchase price and (on the
-- first receipt) the supplier's credit balance all change together, or none
-- do. Rows are locked as they're read, so two people receiving the same
-- purchase at once can't over-receive it. Problems are raised as exceptions
-- whose message is a code the API turns into a response.
CREATE OR REPLACE FUNCTION aimify_receive_purchase(
  p_org uuid,
  p_purchase uuid,
  p_user uuid,
  p_lines jsonb,
  p_client_ref text
) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  pur purchases%ROWTYPE;
  line purchase_lines%ROWTYPE;
  item record;
  receipt_id uuid;
  is_first boolean;
  warehouse_ok boolean;
  held integer;
  previous_price numeric;
  price_changes jsonb := '[]'::jsonb;
  movement_ids jsonb := '[]'::jsonb;
  movement_id uuid;
  outstanding integer;
  new_status text;
  existing uuid;
BEGIN
  IF p_client_ref IS NOT NULL THEN
    SELECT "purchaseId" INTO existing FROM purchase_receipts
      WHERE "organizationId" = p_org AND "clientRef" = p_client_ref;
    IF FOUND THEN
      RETURN jsonb_build_object('duplicate', true, 'purchaseId', existing);
    END IF;
  END IF;

  PERFORM 1 FROM suppliers
    WHERE id = (SELECT "supplierId" FROM purchases WHERE id = p_purchase AND "organizationId" = p_org)
    FOR UPDATE;
  SELECT * INTO pur FROM purchases
    WHERE id = p_purchase AND "organizationId" = p_org
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'purchase_not_found';
  END IF;
  IF pur.status NOT IN ('draft', 'pending', 'partially_received') THEN
    RAISE EXCEPTION 'purchase_not_receivable' USING DETAIL = jsonb_build_object('status', pur.status)::text;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM warehouses
    WHERE id = pur."warehouseId" AND "organizationId" = p_org AND status = 'active'
  ) INTO warehouse_ok;
  IF NOT warehouse_ok THEN
    RAISE EXCEPTION 'warehouse_inactive';
  END IF;

  IF jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'nothing_to_receive';
  END IF;

  is_first := pur."postedAt" IS NULL;

  INSERT INTO purchase_receipts ("organizationId", "purchaseId", "userId", "clientRef")
    VALUES (p_org, p_purchase, p_user, p_client_ref)
    RETURNING id INTO receipt_id;

  FOR item IN
    SELECT * FROM jsonb_to_recordset(p_lines) AS x("lineId" uuid, quantity integer)
  LOOP
    IF item."lineId" IS NULL OR item.quantity IS NULL OR item.quantity <= 0 THEN
      RAISE EXCEPTION 'invalid_quantity';
    END IF;

    SELECT * INTO line FROM purchase_lines
      WHERE id = item."lineId" AND "purchaseId" = p_purchase
      FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'line_not_found' USING DETAIL = jsonb_build_object('lineId', item."lineId")::text;
    END IF;

    IF line."receivedQuantity" + item.quantity > line.quantity THEN
      RAISE EXCEPTION 'over_receipt' USING DETAIL = jsonb_build_object(
        'lineId', line.id,
        'productId', line."productId",
        'remaining', line.quantity - line."receivedQuantity"
      )::text;
    END IF;

    UPDATE purchase_lines
      SET "receivedQuantity" = "receivedQuantity" + item.quantity
      WHERE id = line.id;

    INSERT INTO product_stock ("organizationId", "productId", "warehouseId", quantity)
      VALUES (p_org, line."productId", pur."warehouseId", item.quantity)
      ON CONFLICT ("productId", "warehouseId") DO UPDATE
        SET quantity = product_stock.quantity + EXCLUDED.quantity, "updatedAt" = now()
      RETURNING quantity INTO held;

    SELECT "purchasePrice" INTO previous_price FROM products
      WHERE id = line."productId" AND "organizationId" = p_org
      FOR UPDATE;

    UPDATE products
      SET "currentStock" = "currentStock" + item.quantity,
          "purchasePrice" = line."unitCost",
          "updatedAt" = now()
      WHERE id = line."productId" AND "organizationId" = p_org;

    IF previous_price IS DISTINCT FROM line."unitCost" THEN
      price_changes := price_changes || jsonb_build_object(
        'productId', line."productId",
        'previous', previous_price,
        'new', line."unitCost"
      );
    END IF;

    INSERT INTO stock_movements (
      "organizationId", "warehouseId", "productId", "userId", type, quantity,
      reason, "previousStock", "newStock", "purchaseId"
    ) VALUES (
      p_org, pur."warehouseId", line."productId", p_user, 'stock_in', item.quantity,
      'Received on ' || pur.reference, held - item.quantity, held, p_purchase
    ) RETURNING id INTO movement_id;

    movement_ids := movement_ids || to_jsonb(movement_id);
  END LOOP;

  SELECT coalesce(sum(quantity - "receivedQuantity"), 0) INTO outstanding
    FROM purchase_lines WHERE "purchaseId" = p_purchase;
  new_status := CASE WHEN outstanding = 0 THEN 'received' ELSE 'partially_received' END;

  UPDATE purchases
    SET status = new_status,
        "receivedAt" = CASE WHEN outstanding = 0 THEN now() ELSE "receivedAt" END,
        "postedAt" = coalesce("postedAt", now()),
        "updatedAt" = now()
    WHERE id = p_purchase;

  -- The first delivery puts the whole purchase on the supplier's account,
  -- along with whatever was paid before it arrived.
  IF is_first THEN
    IF pur.total > 0 THEN
      UPDATE suppliers SET balance = balance + pur.total, "updatedAt" = now()
        WHERE id = pur."supplierId" AND "organizationId" = p_org;
      INSERT INTO credit_entries (
        "organizationId", "partyType", "partyId", kind, amount, note, "userId", "purchaseId", "openAmount", "dueDate"
      ) VALUES (
        p_org, 'supplier', pur."supplierId", 'charge', pur.total,
        'Purchase ' || pur.reference, p_user, p_purchase, pur.total - pur."amountPaid",
        now() + make_interval(days => (SELECT "paymentTermsDays" FROM suppliers WHERE id = pur."supplierId"))
      );
    END IF;
    IF pur."amountPaid" > 0 THEN
      UPDATE suppliers SET balance = balance - pur."amountPaid", "updatedAt" = now()
        WHERE id = pur."supplierId" AND "organizationId" = p_org;
      INSERT INTO credit_entries (
        "organizationId", "partyType", "partyId", kind, amount, note, "userId", "purchaseId"
      ) VALUES (
        p_org, 'supplier', pur."supplierId", 'payment', -pur."amountPaid",
        'Paid on purchase ' || pur.reference, p_user, p_purchase
      );
    END IF;
    PERFORM aimify_settle(p_org, 'supplier', pur."supplierId", NULL, p_user);
  END IF;

  RETURN jsonb_build_object(
    'duplicate', false,
    'purchaseId', p_purchase,
    'receiptId', receipt_id,
    'status', new_status,
    'posted', is_first,
    'movementIds', movement_ids,
    'priceChanges', price_changes
  );
END;
$$;
--> statement-breakpoint
-- Recording a payment on a purchase. Before the purchase has reached the
-- supplier's account (nothing received yet) it only raises amountPaid; the
-- first receipt posts it. Afterwards it is also a payment on the supplier's
-- credit ledger. A purchase can't be paid beyond its total.
CREATE OR REPLACE FUNCTION aimify_pay_purchase(
  p_org uuid,
  p_purchase uuid,
  p_user uuid,
  p_amount numeric,
  p_note text,
  p_client_ref text
) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  pur purchases%ROWTYPE;
  amount numeric := round(p_amount, 2);
  payment_id uuid;
  existing uuid;
BEGIN
  IF p_client_ref IS NOT NULL THEN
    SELECT "purchaseId" INTO existing FROM purchase_payments
      WHERE "organizationId" = p_org AND "clientRef" = p_client_ref;
    IF FOUND THEN
      RETURN jsonb_build_object('duplicate', true, 'purchaseId', existing);
    END IF;
  END IF;

  PERFORM 1 FROM suppliers
    WHERE id = (SELECT "supplierId" FROM purchases WHERE id = p_purchase AND "organizationId" = p_org)
    FOR UPDATE;
  SELECT * INTO pur FROM purchases
    WHERE id = p_purchase AND "organizationId" = p_org
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'purchase_not_found';
  END IF;
  IF pur.status = 'cancelled' THEN
    RAISE EXCEPTION 'purchase_cancelled';
  END IF;
  IF amount IS NULL OR amount <= 0 THEN
    RAISE EXCEPTION 'invalid_amount';
  END IF;
  IF pur."amountPaid" + amount > pur.total THEN
    RAISE EXCEPTION 'overpayment' USING DETAIL = jsonb_build_object(
      'remaining', pur.total - pur."amountPaid"
    )::text;
  END IF;

  INSERT INTO purchase_payments ("organizationId", "purchaseId", amount, note, "userId", "clientRef")
    VALUES (p_org, p_purchase, amount, p_note, p_user, p_client_ref)
    RETURNING id INTO payment_id;

  UPDATE purchases
    SET "amountPaid" = "amountPaid" + amount, "updatedAt" = now()
    WHERE id = p_purchase;

  IF pur."postedAt" IS NOT NULL THEN
    UPDATE suppliers SET balance = balance - amount, "updatedAt" = now()
      WHERE id = pur."supplierId" AND "organizationId" = p_org;
    INSERT INTO credit_entries (
      "organizationId", "partyType", "partyId", kind, amount, note, "userId", "purchaseId"
    ) VALUES (
      p_org, 'supplier', pur."supplierId", 'payment', -amount,
      coalesce(nullif(p_note, ''), 'Paid on purchase ' || pur.reference), p_user, p_purchase
    );
    UPDATE credit_entries SET "openAmount" = greatest("openAmount" - round(p_amount, 2), 0)
      WHERE "purchaseId" = p_purchase AND kind = 'charge';
    PERFORM aimify_settle(p_org, 'supplier', pur."supplierId", NULL, p_user);
  END IF;

  RETURN jsonb_build_object(
    'duplicate', false,
    'purchaseId', p_purchase,
    'paymentId', payment_id,
    'amountPaid', pur."amountPaid" + amount,
    'posted', pur."postedAt" IS NOT NULL
  );
END;
$$;
--> statement-breakpoint
-- Cancelling a purchase nothing has been received on. Money already paid on
-- it stays owed back by the supplier: it goes on their account as a negative
-- adjustment, so their balance shows the credit.
CREATE OR REPLACE FUNCTION aimify_cancel_purchase(
  p_org uuid,
  p_purchase uuid,
  p_user uuid
) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  pur purchases%ROWTYPE;
  adjustment_id uuid;
  balance_after numeric;
  refund numeric;
BEGIN
  PERFORM 1 FROM suppliers
    WHERE id = (SELECT "supplierId" FROM purchases WHERE id = p_purchase AND "organizationId" = p_org)
    FOR UPDATE;
  SELECT * INTO pur FROM purchases
    WHERE id = p_purchase AND "organizationId" = p_org
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'purchase_not_found';
  END IF;
  IF pur.status NOT IN ('draft', 'pending') THEN
    RAISE EXCEPTION 'purchase_not_cancellable' USING DETAIL = jsonb_build_object('status', pur.status)::text;
  END IF;

  UPDATE purchases
    SET status = 'cancelled', "cancelledAt" = now(), "updatedAt" = now()
    WHERE id = p_purchase;

  refund := 0;
  IF pur."amountPaid" > 0 THEN
    UPDATE suppliers SET balance = balance - pur."amountPaid", "updatedAt" = now()
      WHERE id = pur."supplierId" AND "organizationId" = p_org
      RETURNING balance INTO balance_after;
    INSERT INTO credit_entries (
      "organizationId", "partyType", "partyId", kind, amount, note, "userId", "purchaseId"
    ) VALUES (
      p_org, 'supplier', pur."supplierId", 'adjustment', -pur."amountPaid",
      'Paid on cancelled purchase ' || pur.reference || ' — owed back by the supplier', p_user, p_purchase
    ) RETURNING id INTO adjustment_id;
    -- What was paid first settles other purchases still owed to them.
    PERFORM aimify_settle(p_org, 'supplier', pur."supplierId", adjustment_id, p_user);
    refund := least(pur."amountPaid", greatest(-balance_after, 0));
  END IF;

  RETURN jsonb_build_object(
    'purchaseId', p_purchase,
    'status', 'cancelled',
    'refundOwed', refund,
    'creditedToAccount', pur."amountPaid" - refund
  );
END;
$$;

--> statement-breakpoint
-- Existing entries (test data only when this was written): debts start fully
-- open and due 30 days after they were made, sales and purchases keep what
-- is still owed on them, then each account is settled.
UPDATE credit_entries SET "openAmount" = amount, "dueDate" = "createdAt" + interval '30 days'
  WHERE amount > 0 AND "saleId" IS NULL AND "purchaseId" IS NULL;
--> statement-breakpoint
UPDATE credit_entries c SET
  "openAmount" = CASE WHEN s.status = 'completed' THEN greatest(s.total - s."amountPaid", 0) ELSE 0 END,
  "dueDate" = s."saleDate" + interval '30 days'
  FROM sales s WHERE c."saleId" = s.id AND c.kind = 'charge';
--> statement-breakpoint
UPDATE sales SET "dueDate" = "saleDate" + interval '30 days' WHERE "customerId" IS NOT NULL;
--> statement-breakpoint
UPDATE credit_entries c SET
  "openAmount" = CASE WHEN p.status <> 'cancelled' THEN greatest(p.total - p."amountPaid", 0) ELSE 0 END,
  "dueDate" = coalesce(p."postedAt", c."createdAt") + interval '30 days'
  FROM purchases p WHERE c."purchaseId" = p.id AND c.kind = 'charge';
--> statement-breakpoint
DO $$
DECLARE party record;
BEGIN
  FOR party IN SELECT DISTINCT "organizationId", "partyType", "partyId" FROM credit_entries LOOP
    PERFORM aimify_settle(party."organizationId", party."partyType", party."partyId", NULL, NULL);
  END LOOP;
END;
$$;
