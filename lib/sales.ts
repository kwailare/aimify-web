import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { customers, products, saleLines, salePayments, sales, users, warehouses } from "@/db/schema";
import { roundMoney } from "@/lib/credit";
import { callDbFunction, type FunctionError, type FunctionOutcome } from "@/lib/db-functions";
import { isUuid } from "@/lib/validation";

export const SALE_STATUSES = ["completed", "voided"] as const;
export const PAYMENT_METHODS = ["cash", "transfer", "pos", "card", "cheque", "other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

const MAX_LINES = 200;

export type SaleLineInput = { productId: string; quantity: number; unitPrice?: number };

export type SaleInput = {
  customerId: string | null;
  warehouseId: string;
  saleDate: Date | null;
  notes: string | null;
  discount: number;
  tax: number;
  lines: SaleLineInput[];
  amountPaid: number | null;
  paymentMethod: PaymentMethod;
  allowOverLimit: boolean;
  clientRef: string | null;
};

function money(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? roundMoney(value) : null;
}

export function isPaymentMethod(value: unknown): value is PaymentMethod {
  return (PAYMENT_METHODS as readonly string[]).includes(value as string);
}

export function parseSaleInput(body: unknown): { data: SaleInput } | { error: string } {
  if (!body || typeof body !== "object") return { error: "A JSON body is required." };
  const input = body as Record<string, unknown>;

  let customerId: string | null = null;
  if (input.customerId !== undefined && input.customerId !== null) {
    if (!isUuid(input.customerId)) return { error: "customerId must be a customer id or null for a walk-in sale." };
    customerId = input.customerId;
  }

  if (!isUuid(input.warehouseId)) return { error: "warehouseId is required." };

  let saleDate: Date | null = null;
  if (input.saleDate !== undefined && input.saleDate !== null) {
    if (typeof input.saleDate !== "string" || Number.isNaN(new Date(input.saleDate).getTime())) {
      return { error: "saleDate must be a date." };
    }
    saleDate = new Date(input.saleDate);
  }

  let notes: string | null = null;
  if (input.notes !== undefined && input.notes !== null) {
    if (typeof input.notes !== "string") return { error: "notes must be text or null." };
    if (input.notes.trim().length > 1000) return { error: "notes must be at most 1000 characters." };
    notes = input.notes.trim() || null;
  }

  const discount = input.discount === undefined ? 0 : money(input.discount);
  const tax = input.tax === undefined ? 0 : money(input.tax);
  if (discount === null) return { error: "discount must be a number, 0 or more." };
  if (tax === null) return { error: "tax must be a number, 0 or more." };

  let amountPaid: number | null = null;
  if (input.amountPaid !== undefined && input.amountPaid !== null) {
    amountPaid = money(input.amountPaid);
    if (amountPaid === null) return { error: "amountPaid must be a number, 0 or more." };
  }

  const paymentMethod = input.paymentMethod === undefined ? "cash" : input.paymentMethod;
  if (!isPaymentMethod(paymentMethod)) {
    return { error: `paymentMethod must be one of: ${PAYMENT_METHODS.join(", ")}.` };
  }

  if (!Array.isArray(input.lines) || input.lines.length === 0) return { error: "lines must list at least one product." };
  if (input.lines.length > MAX_LINES) return { error: `A sale can have at most ${MAX_LINES} lines.` };
  const lines: SaleLineInput[] = [];
  for (const [index, raw] of input.lines.entries()) {
    const line = (raw ?? {}) as Record<string, unknown>;
    if (!isUuid(line.productId)) return { error: `Line ${index + 1}: productId must be a valid id.` };
    if (!Number.isInteger(line.quantity) || (line.quantity as number) <= 0) {
      return { error: `Line ${index + 1}: quantity must be a whole number above 0.` };
    }
    let unitPrice: number | undefined;
    if (line.unitPrice !== undefined && line.unitPrice !== null) {
      const parsed = money(line.unitPrice);
      if (parsed === null) return { error: `Line ${index + 1}: unitPrice must be a number, 0 or more.` };
      unitPrice = parsed;
    }
    lines.push({ productId: line.productId as string, quantity: line.quantity as number, unitPrice });
  }

  const clientRef = typeof input.clientRef === "string" ? input.clientRef : null;
  if (clientRef !== null && (clientRef.length === 0 || clientRef.length > 100)) {
    return { error: "clientRef must be 1 to 100 characters." };
  }

  return {
    data: {
      customerId,
      warehouseId: input.warehouseId,
      saleDate,
      notes,
      discount,
      tax,
      lines,
      amountPaid,
      paymentMethod,
      allowOverLimit: input.allowOverLimit === true,
      clientRef,
    },
  };
}

// The selling price of each product a sale names (only this organization's).
export async function sellingPrices(organizationId: string, productIds: string[]) {
  const rows = await db
    .select({ id: products.id, sellingPrice: products.sellingPrice, name: products.name })
    .from(products)
    .where(and(eq(products.organizationId, organizationId), inArray(products.id, [...new Set(productIds)])));
  return new Map(rows.map((row) => [row.id, { price: roundMoney(row.sellingPrice), name: row.name }]));
}

export function saleTotals(lines: { quantity: number; unitPrice: number }[], discount: number, tax: number) {
  const subtotal = roundMoney(lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0));
  return { subtotal, total: roundMoney(subtotal - discount + tax) };
}

export function paymentStatus(total: number, paid: number) {
  if (paid >= total) return "paid";
  if (paid <= 0) return "unpaid";
  return "partial";
}

const SALE_ERRORS: Record<string, FunctionError> = {
  sale_not_found: { status: 404, error: "Sale not found." },
  sale_voided: { status: 409, error: "This sale was voided." },
  sale_not_voidable: { status: 409, error: "This sale has already been voided." },
  warehouse_inactive: { status: 409, error: "Choose an active warehouse to sell from." },
  invalid_customer: { status: 400, error: "That customer doesn't exist or is archived." },
  invalid_product: { status: 400, error: "One of the products doesn't exist or is archived." },
  invalid_quantity: { status: 400, error: "Each quantity must be a whole number above 0." },
  invalid_amount: { status: 400, error: "amount must be a number above 0." },
  walk_in_must_pay: {
    status: 400,
    error: "A walk-in sale must be paid in full. Choose the customer to sell on credit.",
  },
  insufficient_stock: {
    status: 409,
    error: "Not enough stock in that warehouse.",
    describe: (d) =>
      typeof d.available === "number" && typeof d.name === "string"
        ? `Only ${d.available} of ${d.name} in that warehouse.`
        : null,
  },
  over_credit_limit: {
    status: 409,
    error: "This sale would take the customer over their credit limit.",
    describe: (d) =>
      typeof d.available === "number"
        ? `This would take the customer over their credit limit: only ${roundMoney(d.available)} of credit is left.`
        : null,
  },
  overpayment: {
    status: 409,
    error: "That's more than is still owed on this sale.",
    describe: (d) =>
      typeof d.remaining === "number" ? `Only ${roundMoney(d.remaining)} is still owed on this sale.` : null,
  },
};

export function callSaleFunction(query: ReturnType<typeof sql>): Promise<FunctionOutcome> {
  return callDbFunction(query, SALE_ERRORS);
}

export async function createSale(entry: {
  organizationId: string;
  userId: string;
  input: SaleInput;
  lines: { productId: string; quantity: number; unitPrice: number }[];
  amountPaid: number;
  subtotal: number;
  total: number;
}) {
  const sale = {
    id: randomUUID(),
    customerId: entry.input.customerId,
    warehouseId: entry.input.warehouseId,
    saleDate: entry.input.saleDate?.toISOString() ?? null,
    notes: entry.input.notes,
    subtotal: entry.subtotal,
    discount: entry.input.discount,
    tax: entry.input.tax,
    total: entry.total,
    amountPaid: entry.amountPaid,
    paymentMethod: entry.input.paymentMethod,
    clientRef: entry.input.clientRef,
  };
  const lines = entry.lines.map((line, position) => ({ ...line, position }));
  return callSaleFunction(sql`
    SELECT aimify_create_sale(
      ${entry.organizationId}, ${entry.userId}, ${JSON.stringify(sale)}::jsonb,
      ${JSON.stringify(lines)}::jsonb, ${entry.input.allowOverLimit}
    ) AS "result"
  `);
}

type SaleRow = typeof sales.$inferSelect;

async function linesFor(organizationId: string, saleIds: string[]) {
  const byId = new Map<string, ReturnType<typeof shapeLine>[]>();
  if (saleIds.length === 0) return byId;
  const rows = await db
    .select({
      id: saleLines.id,
      saleId: saleLines.saleId,
      productId: saleLines.productId,
      productName: products.name,
      sku: products.sku,
      unit: products.unit,
      quantity: saleLines.quantity,
      unitPrice: saleLines.unitPrice,
      listPrice: saleLines.listPrice,
    })
    .from(saleLines)
    .innerJoin(products, eq(saleLines.productId, products.id))
    .where(and(eq(saleLines.organizationId, organizationId), inArray(saleLines.saleId, saleIds)))
    .orderBy(asc(saleLines.position));
  for (const row of rows) {
    const list = byId.get(row.saleId) ?? [];
    list.push(shapeLine(row));
    byId.set(row.saleId, list);
  }
  return byId;
}

function shapeLine(row: {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  listPrice: number;
}) {
  return {
    id: row.id,
    productId: row.productId,
    productName: row.productName,
    sku: row.sku,
    unit: row.unit,
    quantity: row.quantity,
    unitPrice: roundMoney(row.unitPrice),
    listPrice: roundMoney(row.listPrice),
    lineTotal: roundMoney(row.quantity * row.unitPrice),
  };
}

function shapeSale(
  row: SaleRow & { customerName: string | null; warehouseName: string; createdByName: string | null },
  lines: ReturnType<typeof shapeLine>[],
) {
  const total = roundMoney(row.total);
  const amountPaid = roundMoney(row.amountPaid);
  return {
    id: row.id,
    number: row.number,
    reference: row.reference,
    customerId: row.customerId,
    customerName: row.customerName ?? "Walk-in customer",
    warehouseId: row.warehouseId,
    warehouseName: row.warehouseName,
    status: row.status,
    saleDate: row.saleDate,
    notes: row.notes,
    subtotal: roundMoney(row.subtotal),
    discount: roundMoney(row.discount),
    tax: roundMoney(row.tax),
    total,
    amountPaid,
    balance: row.status === "voided" ? 0 : roundMoney(total - amountPaid),
    paymentStatus: row.status === "voided" ? "voided" : paymentStatus(total, amountPaid),
    overLimit: row.overLimitApprovedBy !== null,
    voidedAt: row.voidedAt,
    voidReason: row.voidReason,
    createdBy: row.createdBy,
    createdByName: row.createdByName,
    createdAt: row.createdAt,
    units: lines.reduce((sum, l) => sum + l.quantity, 0),
    lines,
  };
}

const saleColumns = {
  sale: sales,
  customerName: customers.name,
  warehouseName: warehouses.name,
  createdByName: users.name,
};

export async function listSales(
  organizationId: string,
  filters: {
    status?: string;
    customerId?: string;
    warehouseId?: string;
    unpaid?: boolean;
    from?: Date;
    to?: Date;
    limit: number;
  },
) {
  const conditions = [eq(sales.organizationId, organizationId)];
  if (filters.status) conditions.push(eq(sales.status, filters.status));
  if (filters.customerId) conditions.push(eq(sales.customerId, filters.customerId));
  if (filters.warehouseId) conditions.push(eq(sales.warehouseId, filters.warehouseId));
  if (filters.unpaid) {
    conditions.push(eq(sales.status, "completed"), sql`${sales.amountPaid} < ${sales.total}`);
  }
  if (filters.from) conditions.push(gte(sales.saleDate, filters.from));
  if (filters.to) conditions.push(lt(sales.saleDate, filters.to));

  const rows = await db
    .select(saleColumns)
    .from(sales)
    .leftJoin(customers, eq(sales.customerId, customers.id))
    .innerJoin(warehouses, eq(sales.warehouseId, warehouses.id))
    .leftJoin(users, eq(sales.createdBy, users.id))
    .where(and(...conditions))
    .orderBy(desc(sales.saleDate), desc(sales.number))
    .limit(filters.limit);

  const lines = await linesFor(organizationId, rows.map((row) => row.sale.id));
  return rows.map((row) =>
    shapeSale(
      { ...row.sale, customerName: row.customerName, warehouseName: row.warehouseName, createdByName: row.createdByName },
      lines.get(row.sale.id) ?? [],
    ),
  );
}

export async function getSale(organizationId: string, saleId: string) {
  const [row] = await db
    .select(saleColumns)
    .from(sales)
    .leftJoin(customers, eq(sales.customerId, customers.id))
    .innerJoin(warehouses, eq(sales.warehouseId, warehouses.id))
    .leftJoin(users, eq(sales.createdBy, users.id))
    .where(and(eq(sales.id, saleId), eq(sales.organizationId, organizationId)))
    .limit(1);

  if (!row) return null;

  const [lines, payments] = await Promise.all([
    linesFor(organizationId, [saleId]),
    db
      .select({
        id: salePayments.id,
        amount: salePayments.amount,
        method: salePayments.method,
        note: salePayments.note,
        createdAt: salePayments.createdAt,
        userName: users.name,
      })
      .from(salePayments)
      .leftJoin(users, eq(salePayments.userId, users.id))
      .where(eq(salePayments.saleId, saleId))
      .orderBy(asc(salePayments.createdAt)),
  ]);

  return {
    ...shapeSale(
      { ...row.sale, customerName: row.customerName, warehouseName: row.warehouseName, createdByName: row.createdByName },
      lines.get(saleId) ?? [],
    ),
    payments: payments.map((p) => ({ ...p, amount: roundMoney(p.amount) })),
  };
}
