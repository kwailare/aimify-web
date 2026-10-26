import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  products,
  purchaseLines,
  purchasePayments,
  purchaseReceipts,
  purchases,
  stockMovements,
  suppliers,
  users,
  warehouses,
} from "@/db/schema";
import { roundMoney } from "@/lib/credit";
import { callDbFunction, type FunctionError, type FunctionOutcome } from "@/lib/db-functions";
import { isUuid } from "@/lib/validation";

export const PURCHASE_STATUSES = [
  "draft",
  "pending",
  "partially_received",
  "received",
  "cancelled",
] as const;
export type PurchaseStatus = (typeof PURCHASE_STATUSES)[number];

const MAX_LINES = 200;

export type LineInput = { productId: string; quantity: number; unitCost: number };

export type PurchaseInput = {
  supplierId?: string;
  warehouseId?: string;
  status?: "draft" | "pending";
  orderDate?: Date;
  expectedDate?: Date | null;
  notes?: string | null;
  discount?: number;
  tax?: number;
  lines?: LineInput[];
};

type Parsed = { data: PurchaseInput } | { error: string };

function money(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? roundMoney(value) : null;
}

function date(value: unknown) {
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function parsePurchaseInput(body: unknown): Parsed {
  if (!body || typeof body !== "object") return { error: "A JSON body is required." };
  const input = body as Record<string, unknown>;
  const data: PurchaseInput = {};

  for (const key of ["supplierId", "warehouseId"] as const) {
    if (!(key in input)) continue;
    if (!isUuid(input[key])) return { error: `${key} must be a valid id.` };
    data[key] = input[key] as string;
  }

  if ("status" in input) {
    if (input.status !== "draft" && input.status !== "pending") {
      return { error: "status must be draft or pending here; receiving and cancelling have their own endpoints." };
    }
    data.status = input.status;
  }

  if ("orderDate" in input) {
    const parsed = date(input.orderDate);
    if (!parsed) return { error: "orderDate must be a date." };
    data.orderDate = parsed;
  }

  if ("expectedDate" in input) {
    if (input.expectedDate === null) {
      data.expectedDate = null;
    } else {
      const parsed = date(input.expectedDate);
      if (!parsed) return { error: "expectedDate must be a date or null." };
      data.expectedDate = parsed;
    }
  }

  if ("notes" in input) {
    if (input.notes !== null && typeof input.notes !== "string") return { error: "notes must be text or null." };
    const notes = typeof input.notes === "string" ? input.notes.trim() : "";
    if (notes.length > 1000) return { error: "notes must be at most 1000 characters." };
    data.notes = notes || null;
  }

  for (const key of ["discount", "tax"] as const) {
    if (!(key in input)) continue;
    const value = money(input[key]);
    if (value === null) return { error: `${key} must be a number, 0 or more.` };
    data[key] = value;
  }

  if ("lines" in input) {
    if (!Array.isArray(input.lines) || input.lines.length === 0) {
      return { error: "lines must list at least one product." };
    }
    if (input.lines.length > MAX_LINES) return { error: `A purchase can have at most ${MAX_LINES} lines.` };
    const lines: LineInput[] = [];
    for (const [index, raw] of input.lines.entries()) {
      const line = (raw ?? {}) as Record<string, unknown>;
      if (!isUuid(line.productId)) return { error: `Line ${index + 1}: productId must be a valid id.` };
      if (!Number.isInteger(line.quantity) || (line.quantity as number) <= 0) {
        return { error: `Line ${index + 1}: quantity must be a whole number above 0.` };
      }
      const unitCost = money(line.unitCost);
      if (unitCost === null) return { error: `Line ${index + 1}: unitCost must be a number, 0 or more.` };
      lines.push({ productId: line.productId as string, quantity: line.quantity as number, unitCost });
    }
    data.lines = lines;
  }

  return { data };
}

export function computeTotals(lines: LineInput[], discount: number, tax: number) {
  const subtotal = roundMoney(lines.reduce((sum, line) => sum + line.quantity * line.unitCost, 0));
  return { subtotal, total: roundMoney(subtotal - discount + tax) };
}

// The supplier, warehouse and products a purchase points at must be this
// organization's, and in use: an active supplier and warehouse, and products
// that aren't archived. Returns the first problem, or null.
export async function checkReferences(
  organizationId: string,
  refs: { supplierId?: string; warehouseId?: string; productIds?: string[] },
) {
  if (refs.supplierId) {
    const [supplier] = await db
      .select({ status: suppliers.status })
      .from(suppliers)
      .where(and(eq(suppliers.id, refs.supplierId), eq(suppliers.organizationId, organizationId)))
      .limit(1);
    if (!supplier) return { code: "invalid_supplier", error: "That supplier doesn't exist." };
    if (supplier.status === "archived") {
      return { code: "invalid_supplier", error: "That supplier is archived. Restore it before buying from it." };
    }
  }

  if (refs.warehouseId) {
    const [warehouse] = await db
      .select({ status: warehouses.status })
      .from(warehouses)
      .where(and(eq(warehouses.id, refs.warehouseId), eq(warehouses.organizationId, organizationId)))
      .limit(1);
    if (!warehouse || warehouse.status !== "active") {
      return { code: "invalid_warehouse", error: "Choose an active warehouse to receive the goods into." };
    }
  }

  if (refs.productIds && refs.productIds.length > 0) {
    const wanted = [...new Set(refs.productIds)];
    const found = await db
      .select({ id: products.id, name: products.name, status: products.status })
      .from(products)
      .where(and(eq(products.organizationId, organizationId), inArray(products.id, wanted)));
    if (found.length !== wanted.length) {
      return { code: "invalid_product", error: "One of the products doesn't exist." };
    }
    const archived = found.find((p) => p.status === "archived");
    if (archived) {
      return { code: "invalid_product", error: `${archived.name} is archived. Restore it before buying it.` };
    }
  }

  return null;
}

// Creates the purchase, its lines and any amount already paid in one
// statement, numbering it from the organization's own counter (PO-0001,
// PO-0002, ...). Returns the new id.
export async function insertPurchase(entry: {
  organizationId: string;
  userId: string;
  supplierId: string;
  warehouseId: string;
  status: "draft" | "pending";
  orderDate: Date;
  expectedDate: Date | null;
  notes: string | null;
  discount: number;
  tax: number;
  lines: LineInput[];
  amountPaid: number;
  clientRef: string | null;
}) {
  const id = randomUUID();
  const { subtotal, total } = computeTotals(entry.lines, entry.discount, entry.tax);
  const lines = JSON.stringify(entry.lines.map((line, position) => ({ ...line, position })));

  await db.execute(sql`
    WITH n AS (
      UPDATE "organizations" SET "purchaseSeq" = "purchaseSeq" + 1
      WHERE "id" = ${entry.organizationId}
      RETURNING "purchaseSeq"
    ),
    p AS (
      INSERT INTO "purchases" (
        "id", "organizationId", "number", "reference", "supplierId", "warehouseId", "status",
        "orderDate", "expectedDate", "notes", "subtotal", "discount", "tax", "total",
        "amountPaid", "createdBy", "clientRef"
      )
      SELECT
        ${id}, ${entry.organizationId}, n."purchaseSeq",
        'PO-' || CASE WHEN n."purchaseSeq" < 10000 THEN lpad(n."purchaseSeq"::text, 4, '0') ELSE n."purchaseSeq"::text END,
        ${entry.supplierId}, ${entry.warehouseId}, ${entry.status},
        ${entry.orderDate}, ${entry.expectedDate}, ${entry.notes},
        ${subtotal}, ${entry.discount}, ${entry.tax}, ${total},
        ${entry.amountPaid}, ${entry.userId}, ${entry.clientRef}
      FROM n
      RETURNING "id"
    ),
    l AS (
      INSERT INTO "purchase_lines" ("organizationId", "purchaseId", "productId", "position", "quantity", "unitCost")
      SELECT ${entry.organizationId}, p."id", x."productId", x."position", x."quantity", x."unitCost"
      FROM p, jsonb_to_recordset(${lines}::jsonb) AS x("productId" uuid, "position" integer, "quantity" integer, "unitCost" numeric)
      RETURNING 1
    ),
    pay AS (
      INSERT INTO "purchase_payments" ("organizationId", "purchaseId", "amount", "note", "userId")
      SELECT ${entry.organizationId}, p."id", ${entry.amountPaid}, 'Paid when the purchase was recorded', ${entry.userId}
      FROM p WHERE ${entry.amountPaid} > 0
      RETURNING 1
    )
    SELECT (SELECT count(*) FROM l) AS "lines", (SELECT count(*) FROM pay) AS "payments"
  `);

  return id;
}

// Replaces the header fields and/or lines of a purchase nothing has been
// received on, in one statement. Returns false if the purchase has since
// been received or cancelled (the WHERE clause is re-checked under the row
// lock, so a receipt in progress always wins).
export async function rewritePurchase(entry: {
  organizationId: string;
  purchaseId: string;
  fields: Record<string, unknown>;
  lines: LineInput[] | null;
}) {
  const assignments = Object.entries(entry.fields).map(
    ([column, value]) => sql`${sql.identifier(column)} = ${value}`,
  );
  assignments.push(sql`"updatedAt" = now()`);
  const lines = entry.lines
    ? JSON.stringify(entry.lines.map((line, position) => ({ ...line, position })))
    : null;

  const result = await db.execute<{ id: string }>(sql`
    WITH p AS (
      UPDATE "purchases" SET ${sql.join(assignments, sql`, `)}
      WHERE "id" = ${entry.purchaseId}
        AND "organizationId" = ${entry.organizationId}
        AND "status" IN ('draft', 'pending')
        AND "postedAt" IS NULL
      RETURNING "id"
    ),
    d AS (
      DELETE FROM "purchase_lines"
      WHERE ${lines}::jsonb IS NOT NULL AND "purchaseId" IN (SELECT "id" FROM p)
      RETURNING 1
    ),
    i AS (
      INSERT INTO "purchase_lines" ("organizationId", "purchaseId", "productId", "position", "quantity", "unitCost")
      SELECT ${entry.organizationId}, p."id", x."productId", x."position", x."quantity", x."unitCost"
      FROM p, jsonb_to_recordset(coalesce(${lines}::jsonb, '[]'::jsonb))
        AS x("productId" uuid, "position" integer, "quantity" integer, "unitCost" numeric)
      RETURNING 1
    )
    SELECT "id" FROM p
  `);

  return result.rows.length > 0;
}

export function paymentStatus(total: number, paid: number) {
  if (paid <= 0) return "unpaid";
  if (paid >= total) return "paid";
  return "partial";
}

type PurchaseRow = typeof purchases.$inferSelect;

async function linesFor(organizationId: string, purchaseIds: string[]) {
  if (purchaseIds.length === 0) return new Map<string, ReturnType<typeof shapeLine>[]>();
  const rows = await db
    .select({
      id: purchaseLines.id,
      purchaseId: purchaseLines.purchaseId,
      productId: purchaseLines.productId,
      productName: products.name,
      sku: products.sku,
      unit: products.unit,
      quantity: purchaseLines.quantity,
      unitCost: purchaseLines.unitCost,
      receivedQuantity: purchaseLines.receivedQuantity,
      position: purchaseLines.position,
    })
    .from(purchaseLines)
    .innerJoin(products, eq(purchaseLines.productId, products.id))
    .where(and(eq(purchaseLines.organizationId, organizationId), inArray(purchaseLines.purchaseId, purchaseIds)))
    .orderBy(asc(purchaseLines.position));

  const byPurchase = new Map<string, ReturnType<typeof shapeLine>[]>();
  for (const row of rows) {
    const list = byPurchase.get(row.purchaseId) ?? [];
    list.push(shapeLine(row));
    byPurchase.set(row.purchaseId, list);
  }
  return byPurchase;
}

function shapeLine(row: {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  unit: string;
  quantity: number;
  unitCost: number;
  receivedQuantity: number;
}) {
  return {
    id: row.id,
    productId: row.productId,
    productName: row.productName,
    sku: row.sku,
    unit: row.unit,
    quantity: row.quantity,
    unitCost: roundMoney(row.unitCost),
    lineTotal: roundMoney(row.quantity * row.unitCost),
    receivedQuantity: row.receivedQuantity,
  };
}

function shapePurchase(
  row: PurchaseRow & { supplierName: string; warehouseName: string; createdByName: string | null },
  lines: ReturnType<typeof shapeLine>[],
) {
  const total = roundMoney(row.total);
  const amountPaid = roundMoney(row.amountPaid);
  return {
    id: row.id,
    number: row.number,
    reference: row.reference,
    supplierId: row.supplierId,
    supplierName: row.supplierName,
    warehouseId: row.warehouseId,
    warehouseName: row.warehouseName,
    status: row.status,
    orderDate: row.orderDate,
    expectedDate: row.expectedDate,
    notes: row.notes,
    subtotal: roundMoney(row.subtotal),
    discount: roundMoney(row.discount),
    tax: roundMoney(row.tax),
    total,
    amountPaid,
    balance: roundMoney(total - amountPaid),
    paymentStatus: paymentStatus(total, amountPaid),
    postedAt: row.postedAt,
    receivedAt: row.receivedAt,
    cancelledAt: row.cancelledAt,
    createdBy: row.createdBy,
    createdByName: row.createdByName,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    unitsOrdered: lines.reduce((sum, line) => sum + line.quantity, 0),
    unitsReceived: lines.reduce((sum, line) => sum + line.receivedQuantity, 0),
    lines,
  };
}

const purchaseColumns = {
  purchase: purchases,
  supplierName: suppliers.name,
  warehouseName: warehouses.name,
  createdByName: users.name,
};

export async function listPurchases(
  organizationId: string,
  filters: { status?: string; supplierId?: string; warehouseId?: string; limit: number },
) {
  const conditions = [eq(purchases.organizationId, organizationId)];
  if (filters.status === "open") {
    conditions.push(inArray(purchases.status, ["draft", "pending", "partially_received"]));
  } else if (filters.status) {
    conditions.push(eq(purchases.status, filters.status));
  }
  if (filters.supplierId) conditions.push(eq(purchases.supplierId, filters.supplierId));
  if (filters.warehouseId) conditions.push(eq(purchases.warehouseId, filters.warehouseId));

  const rows = await db
    .select(purchaseColumns)
    .from(purchases)
    .innerJoin(suppliers, eq(purchases.supplierId, suppliers.id))
    .innerJoin(warehouses, eq(purchases.warehouseId, warehouses.id))
    .leftJoin(users, eq(purchases.createdBy, users.id))
    .where(and(...conditions))
    .orderBy(desc(purchases.orderDate), desc(purchases.number))
    .limit(filters.limit);

  const lines = await linesFor(organizationId, rows.map((row) => row.purchase.id));
  return rows.map((row) =>
    shapePurchase(
      { ...row.purchase, supplierName: row.supplierName, warehouseName: row.warehouseName, createdByName: row.createdByName },
      lines.get(row.purchase.id) ?? [],
    ),
  );
}

export async function getPurchase(organizationId: string, purchaseId: string) {
  const [row] = await db
    .select(purchaseColumns)
    .from(purchases)
    .innerJoin(suppliers, eq(purchases.supplierId, suppliers.id))
    .innerJoin(warehouses, eq(purchases.warehouseId, warehouses.id))
    .leftJoin(users, eq(purchases.createdBy, users.id))
    .where(and(eq(purchases.id, purchaseId), eq(purchases.organizationId, organizationId)))
    .limit(1);

  if (!row) return null;

  const [lines, receipts, movements, payments] = await Promise.all([
    linesFor(organizationId, [purchaseId]),
    db
      .select({ id: purchaseReceipts.id, createdAt: purchaseReceipts.createdAt, userName: users.name })
      .from(purchaseReceipts)
      .leftJoin(users, eq(purchaseReceipts.userId, users.id))
      .where(eq(purchaseReceipts.purchaseId, purchaseId))
      .orderBy(asc(purchaseReceipts.createdAt)),
    db
      .select({
        id: stockMovements.id,
        productId: stockMovements.productId,
        quantity: stockMovements.quantity,
        createdAt: stockMovements.createdAt,
      })
      .from(stockMovements)
      .where(and(eq(stockMovements.purchaseId, purchaseId), ne(stockMovements.quantity, 0)))
      .orderBy(asc(stockMovements.createdAt)),
    db
      .select({
        id: purchasePayments.id,
        amount: purchasePayments.amount,
        note: purchasePayments.note,
        createdAt: purchasePayments.createdAt,
        userName: users.name,
      })
      .from(purchasePayments)
      .leftJoin(users, eq(purchasePayments.userId, users.id))
      .where(eq(purchasePayments.purchaseId, purchaseId))
      .orderBy(asc(purchasePayments.createdAt)),
  ]);

  return {
    ...shapePurchase(
      { ...row.purchase, supplierName: row.supplierName, warehouseName: row.warehouseName, createdByName: row.createdByName },
      lines.get(purchaseId) ?? [],
    ),
    receipts: receipts.map((receipt) => ({
      ...receipt,
      // A receipt and the movements it writes are one database transaction,
      // so they carry the identical timestamp (now() is the transaction start).
      lines: movements
        .filter((m) => m.createdAt.getTime() === receipt.createdAt.getTime())
        .map((m) => ({ productId: m.productId, quantity: m.quantity })),
    })),
    payments: payments.map((payment) => ({ ...payment, amount: roundMoney(payment.amount) })),
  };
}

export async function findPurchaseByClientRef(organizationId: string, clientRef: string) {
  const [row] = await db
    .select({ id: purchases.id })
    .from(purchases)
    .where(and(eq(purchases.organizationId, organizationId), eq(purchases.clientRef, clientRef)))
    .limit(1);
  return row?.id ?? null;
}

const PURCHASE_ERRORS: Record<string, FunctionError> = {
  purchase_not_found: { status: 404, error: "Purchase not found." },
  purchase_not_receivable: { status: 409, error: "This purchase can't be received in its current status." },
  purchase_not_cancellable: { status: 409, error: "Only a draft or pending purchase with nothing received can be cancelled." },
  purchase_cancelled: { status: 409, error: "This purchase is cancelled." },
  warehouse_inactive: { status: 409, error: "The purchase's warehouse is disabled. Enable it before receiving." },
  nothing_to_receive: { status: 400, error: "Say how many of at least one line arrived." },
  invalid_quantity: { status: 400, error: "Each received quantity must be a whole number above 0." },
  line_not_found: { status: 400, error: "One of the lines isn't on this purchase." },
  over_receipt: {
    status: 409,
    error: "That's more than is still outstanding on the line.",
    describe: (d) => (typeof d.remaining === "number" ? `Only ${d.remaining} still outstanding on that line.` : null),
  },
  invalid_amount: { status: 400, error: "amount must be a number above 0." },
  overpayment: {
    status: 409,
    error: "That's more than is still owed on this purchase.",
    describe: (d) =>
      typeof d.remaining === "number" ? `Only ${roundMoney(d.remaining)} is still owed on this purchase.` : null,
  },
};

// Calls one of the purchase database functions (see callDbFunction).
export function callPurchaseFunction(query: ReturnType<typeof sql>): Promise<FunctionOutcome> {
  return callDbFunction(query, PURCHASE_ERRORS);
}
