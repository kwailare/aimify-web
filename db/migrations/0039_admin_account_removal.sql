-- What the Aimify team can do to an account from the admin pages, each in
-- one all-or-nothing step (see lib/admin-accounts.ts).

-- Wipe a business's own data (stock, sales, purchases, customers,
-- suppliers, expenses, WhatsApp messages) and restart its numbering. The
-- organization, its team, warehouses, permissions, plan, billing and audit
-- history stay. Returns how many rows went.
CREATE OR REPLACE FUNCTION aimify_reset_organization_data(p_org uuid) RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE
  removed integer := 0;
  n integer;
BEGIN
  DELETE FROM credit_allocations WHERE "organizationId" = p_org; GET DIAGNOSTICS n = ROW_COUNT; removed := removed + n;
  DELETE FROM sale_payments WHERE "organizationId" = p_org; GET DIAGNOSTICS n = ROW_COUNT; removed := removed + n;
  DELETE FROM purchase_payments WHERE "organizationId" = p_org; GET DIAGNOSTICS n = ROW_COUNT; removed := removed + n;
  DELETE FROM whatsapp_messages WHERE "organizationId" = p_org; GET DIAGNOSTICS n = ROW_COUNT; removed := removed + n;
  DELETE FROM stock_movements WHERE "organizationId" = p_org; GET DIAGNOSTICS n = ROW_COUNT; removed := removed + n;
  DELETE FROM sale_lines WHERE "organizationId" = p_org; GET DIAGNOSTICS n = ROW_COUNT; removed := removed + n;
  DELETE FROM purchase_lines WHERE "organizationId" = p_org; GET DIAGNOSTICS n = ROW_COUNT; removed := removed + n;
  DELETE FROM purchase_receipts WHERE "organizationId" = p_org; GET DIAGNOSTICS n = ROW_COUNT; removed := removed + n;
  DELETE FROM credit_entries WHERE "organizationId" = p_org; GET DIAGNOSTICS n = ROW_COUNT; removed := removed + n;
  DELETE FROM sales WHERE "organizationId" = p_org; GET DIAGNOSTICS n = ROW_COUNT; removed := removed + n;
  DELETE FROM purchases WHERE "organizationId" = p_org; GET DIAGNOSTICS n = ROW_COUNT; removed := removed + n;
  DELETE FROM expenses WHERE "organizationId" = p_org; GET DIAGNOSTICS n = ROW_COUNT; removed := removed + n;
  DELETE FROM recurring_expenses WHERE "organizationId" = p_org; GET DIAGNOSTICS n = ROW_COUNT; removed := removed + n;
  DELETE FROM expense_categories WHERE "organizationId" = p_org; GET DIAGNOSTICS n = ROW_COUNT; removed := removed + n;
  DELETE FROM product_stock WHERE "organizationId" = p_org; GET DIAGNOSTICS n = ROW_COUNT; removed := removed + n;
  DELETE FROM products WHERE "organizationId" = p_org; GET DIAGNOSTICS n = ROW_COUNT; removed := removed + n;
  DELETE FROM customers WHERE "organizationId" = p_org; GET DIAGNOSTICS n = ROW_COUNT; removed := removed + n;
  DELETE FROM customer_types WHERE "organizationId" = p_org; GET DIAGNOSTICS n = ROW_COUNT; removed := removed + n;
  DELETE FROM suppliers WHERE "organizationId" = p_org; GET DIAGNOSTICS n = ROW_COUNT; removed := removed + n;
  DELETE FROM catalog_options WHERE "organizationId" = p_org; GET DIAGNOSTICS n = ROW_COUNT; removed := removed + n;
  UPDATE organizations
    SET "purchaseSeq" = 0, "saleSeq" = 0, "receiptSeq" = 0, "expenseSeq" = 0
    WHERE id = p_org;
  RETURN removed;
END;
$$;--> statement-breakpoint

-- Remove a person from everything. Refused ('sole_owner') while they are
-- the only Owner of an organization. Records they made for a business stay
-- with the business, no longer naming them; their sign-in data, sessions,
-- memberships and support tickets go. Columns pointing at users are found
-- from the database itself, so a table added later is covered too.
CREATE OR REPLACE FUNCTION aimify_delete_user(p_user uuid) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  user_email text;
  fk record;
BEGIN
  SELECT lower(email) INTO user_email FROM users WHERE id = p_user;
  IF user_email IS NULL THEN
    RAISE EXCEPTION 'user_not_found';
  END IF;

  IF EXISTS (
    SELECT 1 FROM memberships m
    WHERE m."userId" = p_user AND m.role = 'Owner'
      AND NOT EXISTS (
        SELECT 1 FROM memberships o
        WHERE o."organizationId" = m."organizationId" AND o.role = 'Owner' AND o."userId" <> p_user
      )
  ) THEN
    RAISE EXCEPTION 'sole_owner';
  END IF;

  DELETE FROM support_messages WHERE "ticketId" IN (
    SELECT id FROM support_tickets WHERE "userId" = p_user OR lower(email) = user_email
  );
  DELETE FROM support_tickets WHERE "userId" = p_user OR lower(email) = user_email;
  DELETE FROM login_attempts WHERE identifier = 'email:' || user_email;

  FOR fk IN
    SELECT cl.relname AS tbl, att.attname AS col, att.attnotnull AS required
    FROM pg_constraint con
    JOIN pg_class cl ON cl.oid = con.conrelid
    JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = con.conkey[1]
    WHERE con.contype = 'f' AND con.confrelid = 'public.users'::regclass
  LOOP
    IF fk.required THEN
      EXECUTE format('DELETE FROM %I WHERE %I = $1', fk.tbl, fk.col) USING p_user;
    ELSE
      EXECUTE format('UPDATE %I SET %I = NULL WHERE %I = $1', fk.tbl, fk.col, fk.col) USING p_user;
    END IF;
  END LOOP;

  DELETE FROM users WHERE id = p_user;
END;
$$;--> statement-breakpoint

-- Remove an organization and everything it holds. Its members go too,
-- unless they belong to another organization or are on the Aimify team (then
-- only their membership here goes). If a table holding this organization's
-- rows is ever missed here, the final delete fails and nothing is removed.
-- Returns how many people were removed.
CREATE OR REPLACE FUNCTION aimify_delete_organization(p_org uuid) RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE
  leaving uuid[];
  person uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM organizations WHERE id = p_org) THEN
    RAISE EXCEPTION 'organization_not_found';
  END IF;

  SELECT coalesce(array_agg(m."userId"), '{}') INTO leaving
  FROM memberships m
  WHERE m."organizationId" = p_org
    AND NOT EXISTS (SELECT 1 FROM memberships o WHERE o."userId" = m."userId" AND o."organizationId" <> p_org)
    AND NOT EXISTS (SELECT 1 FROM admin_users a WHERE a."userId" = m."userId");

  PERFORM aimify_reset_organization_data(p_org);
  DELETE FROM warehouses WHERE "organizationId" = p_org;
  DELETE FROM role_permissions WHERE "organizationId" = p_org;
  DELETE FROM invitations WHERE "organizationId" = p_org;
  DELETE FROM subscription_notices WHERE "organizationId" = p_org;
  DELETE FROM payment_methods WHERE "organizationId" = p_org;
  DELETE FROM payments WHERE "organizationId" = p_org;
  DELETE FROM support_messages WHERE "ticketId" IN (SELECT id FROM support_tickets WHERE "organizationId" = p_org);
  DELETE FROM support_tickets WHERE "organizationId" = p_org;
  DELETE FROM audit_logs WHERE "organizationId" = p_org;
  DELETE FROM memberships WHERE "organizationId" = p_org;

  FOREACH person IN ARRAY leaving LOOP
    PERFORM aimify_delete_user(person);
  END LOOP;

  DELETE FROM organizations WHERE id = p_org;
  RETURN coalesce(array_length(leaving, 1), 0);
END;
$$;
