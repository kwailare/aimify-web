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
        "organizationId", "partyType", "partyId", kind, amount, note, "userId", "purchaseId"
      ) VALUES (
        p_org, 'supplier', pur."supplierId", 'charge', pur.total,
        'Purchase ' || pur.reference, p_user, p_purchase
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
BEGIN
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

  IF pur."amountPaid" > 0 THEN
    UPDATE suppliers SET balance = balance - pur."amountPaid", "updatedAt" = now()
      WHERE id = pur."supplierId" AND "organizationId" = p_org;
    INSERT INTO credit_entries (
      "organizationId", "partyType", "partyId", kind, amount, note, "userId", "purchaseId"
    ) VALUES (
      p_org, 'supplier', pur."supplierId", 'adjustment', -pur."amountPaid",
      'Paid on cancelled purchase ' || pur.reference || ' — owed back by the supplier', p_user, p_purchase
    );
  END IF;

  RETURN jsonb_build_object(
    'purchaseId', p_purchase,
    'status', 'cancelled',
    'refundOwed', pur."amountPaid"
  );
END;
$$;
