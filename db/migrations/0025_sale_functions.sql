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
    coalesce((p_sale->>'saleDate')::timestamp, now()), nullif(p_sale->>'notes', ''),
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
  IF customer_id IS NOT NULL AND total > 0 THEN
    UPDATE customers SET balance = balance + total - paid, "updatedAt" = now() WHERE id = customer_id;
    INSERT INTO credit_entries ("organizationId", "partyType", "partyId", kind, amount, note, "userId", "saleId")
      VALUES (p_org, 'customer', customer_id, 'charge', total, 'Sale ' || ref, p_user, sale_id);
    IF paid > 0 THEN
      INSERT INTO credit_entries ("organizationId", "partyType", "partyId", kind, amount, note, "userId", "saleId")
        VALUES (p_org, 'customer', customer_id, 'payment', -paid, 'Paid on sale ' || ref, p_user, sale_id);
    END IF;
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
    INSERT INTO credit_entries ("organizationId", "partyType", "partyId", kind, amount, note, "userId", "saleId")
      VALUES (p_org, 'customer', s."customerId", 'payment', -amount,
              coalesce(nullif(p_note, ''), 'Paid on sale ' || s.reference), p_user, p_sale);
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
BEGIN
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

  IF s."customerId" IS NOT NULL AND s.total > 0 THEN
    UPDATE customers SET balance = balance - s.total, "updatedAt" = now() WHERE id = s."customerId";
    INSERT INTO credit_entries ("organizationId", "partyType", "partyId", kind, amount, note, "userId", "saleId")
      VALUES (p_org, 'customer', s."customerId", 'adjustment', -s.total,
              'Voided sale ' || s.reference || coalesce(' — ' || nullif(p_reason, ''), ''), p_user, p_sale);
  END IF;

  RETURN jsonb_build_object('saleId', p_sale, 'status', 'voided', 'refundOwed', s."amountPaid");
END;
$$;
