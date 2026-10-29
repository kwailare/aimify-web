import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, gte, lt, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { expenseCategories, expenses, recurringExpenses, users, warehouses } from "@/db/schema";
import { roundMoney } from "@/lib/credit";
import { PAYMENT_METHODS } from "@/lib/sales";
import { isUuid } from "@/lib/validation";

// Expenses: money the business spends, by category, optionally against a
// warehouse, with the receipt attached. Numbered per organization
// (EXP-0001). Edited in place (who and when is kept, and the audit log has
// every change) or voided with a reason; never deleted.

export const DEFAULT_EXPENSE_CATEGORIES = [
  "Rent",
  "Salaries & wages",
  "Transport & logistics",
  "Utilities",
  "Fuel & generator",
  "Repairs & maintenance",
  "Marketing",
  "Bank charges",
  "Taxes & levies",
  "Other",
];

export const FREQUENCIES = ["weekly", "monthly", "yearly"] as const;
export type Frequency = (typeof FREQUENCIES)[number];

export async function seedDefaultExpenseCategories(organizationId: string) {
  await db
    .insert(expenseCategories)
    .values(DEFAULT_EXPENSE_CATEGORIES.map((name) => ({ organizationId, name })))
    .onConflictDoNothing();
}

type Parsed<T> = { data: T } | { error: string };

function optionalText(input: Record<string, unknown>, key: string, max: number): string | null | undefined | Error {
  if (!(key in input)) return undefined;
  const value = input[key];
  if (value === null) return null;
  if (typeof value !== "string" || value.length > max) {
    return new Error(`${key} must be a string of at most ${max} characters or null.`);
  }
  return value.trim() || null;
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export type ExpenseFields = {
  categoryId?: string;
  description?: string | null;
  amount?: number;
  expenseDate?: Date;
  paymentMethod?: string;
  warehouseId?: string | null;
  payee?: string | null;
  receiptNumber?: string | null;
};

// The fields of an expense (create: categoryId and amount required).
export function parseExpenseFields(body: unknown, { creating }: { creating: boolean }): Parsed<ExpenseFields> {
  if (!body || typeof body !== "object") return { error: "A JSON body is required." };
  const input = body as Record<string, unknown>;
  const data: ExpenseFields = {};

  if ("categoryId" in input || creating) {
    if (typeof input.categoryId !== "string" || !isUuid(input.categoryId)) {
      return { error: "categoryId must be one of your expense categories." };
    }
    data.categoryId = input.categoryId;
  }
  if ("amount" in input || creating) {
    const amount = input.amount;
    if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
      return { error: "amount must be a number above 0." };
    }
    data.amount = roundMoney(amount);
  }
  if ("expenseDate" in input) {
    const date = parseDate(input.expenseDate);
    if (!date) return { error: "expenseDate must be a date." };
    data.expenseDate = date;
  }
  if ("paymentMethod" in input) {
    if (!(PAYMENT_METHODS as readonly unknown[]).includes(input.paymentMethod)) {
      return { error: `paymentMethod must be one of: ${PAYMENT_METHODS.join(", ")}.` };
    }
    data.paymentMethod = input.paymentMethod as string;
  }
  if ("warehouseId" in input) {
    const w = input.warehouseId;
    if (w !== null && !(typeof w === "string" && isUuid(w))) {
      return { error: "warehouseId must be a warehouse id or null." };
    }
    data.warehouseId = w as string | null;
  }
  for (const [key, max] of [["description", 500], ["payee", 200], ["receiptNumber", 100]] as const) {
    const value = optionalText(input, key, max);
    if (value instanceof Error) return { error: value.message };
    if (value !== undefined) data[key] = value;
  }
  return { data };
}

/** Checks the category and warehouse belong to the organization. */
export async function checkReferences(organizationId: string, fields: ExpenseFields): Promise<string | null> {
  if (fields.categoryId) {
    const [category] = await db
      .select({ id: expenseCategories.id })
      .from(expenseCategories)
      .where(and(eq(expenseCategories.id, fields.categoryId), eq(expenseCategories.organizationId, organizationId)))
      .limit(1);
    if (!category) return "That expense category doesn't exist.";
  }
  if (fields.warehouseId) {
    const [warehouse] = await db
      .select({ id: warehouses.id })
      .from(warehouses)
      .where(and(eq(warehouses.id, fields.warehouseId), eq(warehouses.organizationId, organizationId)))
      .limit(1);
    if (!warehouse) return "That warehouse doesn't exist.";
  }
  return null;
}

/** Records an expense with the next number, in one statement. Returns its id. */
export async function insertExpense(entry: {
  organizationId: string;
  userId: string;
  fields: Required<Pick<ExpenseFields, "categoryId" | "amount">> & ExpenseFields;
  clientRef: string | null;
  recurringId?: string | null;
}) {
  const id = randomUUID();
  const f = entry.fields;
  await db.execute(sql`
    WITH n AS (
      UPDATE "organizations" SET "expenseSeq" = "expenseSeq" + 1
      WHERE "id" = ${entry.organizationId}
      RETURNING "expenseSeq"
    )
    INSERT INTO "expenses" (
      "id", "organizationId", "number", "reference", "categoryId", "description", "amount", "expenseDate",
      "paymentMethod", "warehouseId", "payee", "receiptNumber", "recurringId", "createdBy", "clientRef"
    )
    SELECT
      ${id}, ${entry.organizationId}, n."expenseSeq",
      'EXP-' || CASE WHEN n."expenseSeq" < 10000 THEN lpad(n."expenseSeq"::text, 4, '0') ELSE n."expenseSeq"::text END,
      ${f.categoryId}, ${f.description ?? null}, ${f.amount},
      ${(f.expenseDate ?? new Date()).toISOString()}::timestamp,
      ${f.paymentMethod ?? "cash"}, ${f.warehouseId ?? null}, ${f.payee ?? null}, ${f.receiptNumber ?? null},
      ${entry.recurringId ?? null}, ${entry.userId}, ${entry.clientRef}
    FROM n
  `);
  return id;
}

const createdBy = sql<string | null>`(select ${users.name} from ${users} where ${users.id} = ${expenses.createdBy})`;
const updatedBy = sql<string | null>`(select ${users.name} from ${users} where ${users.id} = ${expenses.updatedBy})`;
const voidedBy = sql<string | null>`(select ${users.name} from ${users} where ${users.id} = ${expenses.voidedBy})`;

const columns = {
  expense: expenses,
  categoryName: expenseCategories.name,
  warehouseName: warehouses.name,
  createdByName: createdBy,
  updatedByName: updatedBy,
  voidedByName: voidedBy,
};

type ExpenseRow = {
  expense: typeof expenses.$inferSelect;
  categoryName: string;
  warehouseName: string | null;
  createdByName: string | null;
  updatedByName: string | null;
  voidedByName: string | null;
};

function shape(row: ExpenseRow) {
  const e = row.expense;
  return {
    id: e.id,
    number: e.number,
    reference: e.reference,
    categoryId: e.categoryId,
    categoryName: row.categoryName,
    description: e.description,
    amount: roundMoney(e.amount),
    expenseDate: e.expenseDate,
    paymentMethod: e.paymentMethod,
    warehouseId: e.warehouseId,
    warehouseName: row.warehouseName,
    payee: e.payee,
    receiptNumber: e.receiptNumber,
    attachmentUrl: e.attachmentUrl,
    attachmentName: e.attachmentName,
    attachmentType: e.attachmentType,
    status: e.status,
    voidReason: e.voidReason,
    voidedAt: e.voidedAt,
    voidedByName: row.voidedByName,
    recurringId: e.recurringId,
    createdBy: e.createdBy,
    createdByName: row.createdByName,
    createdAt: e.createdAt,
    updatedByName: row.updatedByName,
    updatedAt: e.updatedAt,
  };
}

export type ExpenseShape = ReturnType<typeof shape>;

export async function listExpenses(
  organizationId: string,
  filters: { from?: Date; to?: Date; categoryId?: string; warehouseId?: string; status?: string; limit: number },
) {
  const conditions = [eq(expenses.organizationId, organizationId)];
  if (filters.from) conditions.push(gte(expenses.expenseDate, filters.from));
  if (filters.to) conditions.push(lt(expenses.expenseDate, filters.to));
  if (filters.categoryId) conditions.push(eq(expenses.categoryId, filters.categoryId));
  if (filters.warehouseId) conditions.push(eq(expenses.warehouseId, filters.warehouseId));
  if (filters.status) conditions.push(eq(expenses.status, filters.status));
  const rows = await db
    .select(columns)
    .from(expenses)
    .innerJoin(expenseCategories, eq(expenseCategories.id, expenses.categoryId))
    .leftJoin(warehouses, eq(warehouses.id, expenses.warehouseId))
    .where(and(...conditions))
    .orderBy(desc(expenses.expenseDate), desc(expenses.number))
    .limit(filters.limit);
  return rows.map(shape);
}

export async function getExpense(organizationId: string, id: string) {
  if (!isUuid(id)) return null;
  const [row] = await db
    .select(columns)
    .from(expenses)
    .innerJoin(expenseCategories, eq(expenseCategories.id, expenses.categoryId))
    .leftJoin(warehouses, eq(warehouses.id, expenses.warehouseId))
    .where(and(eq(expenses.id, id), eq(expenses.organizationId, organizationId)))
    .limit(1);
  return row ? shape(row) : null;
}

export async function findExpenseByClientRef(organizationId: string, clientRef: string) {
  const [row] = await db
    .select({ id: expenses.id })
    .from(expenses)
    .where(and(eq(expenses.organizationId, organizationId), eq(expenses.clientRef, clientRef)))
    .limit(1);
  return row?.id ?? null;
}

// ---- Categories ----

export async function listCategories(organizationId: string) {
  const [rows, counts] = await Promise.all([
    db
      .select()
      .from(expenseCategories)
      .where(eq(expenseCategories.organizationId, organizationId))
      .orderBy(asc(expenseCategories.name)),
    db
      .select({ categoryId: expenses.categoryId, count: sql<number>`count(*)::int` })
      .from(expenses)
      .where(eq(expenses.organizationId, organizationId))
      .groupBy(expenses.categoryId),
  ]);
  const used = new Map(counts.map((c) => [c.categoryId, c.count]));
  return rows.map((c) => shapeCategory(c, used.get(c.id) ?? 0));
}

export function shapeCategory(c: typeof expenseCategories.$inferSelect, expenseCount = 0) {
  return { id: c.id, name: c.name, monthlyBudget: roundMoney(c.monthlyBudget), expenseCount };
}

export function parseCategoryFields(body: unknown): Parsed<{ name?: string; monthlyBudget?: number }> {
  if (!body || typeof body !== "object") return { error: "A JSON body is required." };
  const input = body as Record<string, unknown>;
  const data: { name?: string; monthlyBudget?: number } = {};
  if ("name" in input) {
    const name = typeof input.name === "string" ? input.name.trim() : "";
    if (!name || name.length > 60) return { error: "name is required and must be at most 60 characters." };
    data.name = name;
  }
  if ("monthlyBudget" in input) {
    const v = input.monthlyBudget;
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0) {
      return { error: "monthlyBudget must be a non-negative number (0 for none)." };
    }
    data.monthlyBudget = roundMoney(v);
  }
  return { data };
}

export async function categoryNameTaken(organizationId: string, name: string, exceptId?: string) {
  const conditions = [
    eq(expenseCategories.organizationId, organizationId),
    sql`lower(${expenseCategories.name}) = lower(${name})`,
  ];
  if (exceptId) conditions.push(ne(expenseCategories.id, exceptId));
  const [row] = await db.select({ id: expenseCategories.id }).from(expenseCategories).where(and(...conditions)).limit(1);
  return Boolean(row);
}

export async function categoryUsage(organizationId: string, categoryId: string) {
  const [[e], [r]] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(expenses)
      .where(and(eq(expenses.organizationId, organizationId), eq(expenses.categoryId, categoryId))),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(recurringExpenses)
      .where(and(eq(recurringExpenses.organizationId, organizationId), eq(recurringExpenses.categoryId, categoryId))),
  ]);
  return (e?.count ?? 0) + (r?.count ?? 0);
}

// ---- Recurring ----

/** The next due date after [date] for [frequency], keeping the day of the month where it can. */
export function nextDue(date: Date, frequency: Frequency) {
  const next = new Date(date);
  if (frequency === "weekly") next.setUTCDate(next.getUTCDate() + 7);
  else if (frequency === "yearly") next.setUTCFullYear(next.getUTCFullYear() + 1);
  else {
    const day = next.getUTCDate();
    next.setUTCDate(1);
    next.setUTCMonth(next.getUTCMonth() + 1);
    const lastDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
    next.setUTCDate(Math.min(day, lastDay));
  }
  return next;
}

export type RecurringFields = Omit<ExpenseFields, "expenseDate" | "receiptNumber"> & {
  frequency?: Frequency;
  nextDueDate?: Date;
  active?: boolean;
};

export function parseRecurringFields(body: unknown, { creating }: { creating: boolean }): Parsed<RecurringFields> {
  const base = parseExpenseFields(body, { creating });
  if ("error" in base) return base;
  const input = body as Record<string, unknown>;
  const data: RecurringFields = { ...base.data };
  delete (data as ExpenseFields).expenseDate;
  delete (data as ExpenseFields).receiptNumber;
  if (creating && !data.description) return { error: "description is required (e.g. Shop rent)." };
  if ("frequency" in input || creating) {
    if (!(FREQUENCIES as readonly unknown[]).includes(input.frequency)) {
      return { error: `frequency must be one of: ${FREQUENCIES.join(", ")}.` };
    }
    data.frequency = input.frequency as Frequency;
  }
  if ("nextDueDate" in input || creating) {
    const date = parseDate(input.nextDueDate);
    if (!date) return { error: "nextDueDate must be a date." };
    data.nextDueDate = date;
  }
  if ("active" in input) {
    if (typeof input.active !== "boolean") return { error: "active must be true or false." };
    data.active = input.active;
  }
  return { data };
}

export async function listRecurring(organizationId: string) {
  const rows = await db
    .select({ r: recurringExpenses, categoryName: expenseCategories.name, warehouseName: warehouses.name })
    .from(recurringExpenses)
    .innerJoin(expenseCategories, eq(expenseCategories.id, recurringExpenses.categoryId))
    .leftJoin(warehouses, eq(warehouses.id, recurringExpenses.warehouseId))
    .where(eq(recurringExpenses.organizationId, organizationId))
    .orderBy(asc(recurringExpenses.nextDueDate));
  return rows.map(shapeRecurring);
}

export function shapeRecurring(row: {
  r: typeof recurringExpenses.$inferSelect;
  categoryName: string;
  warehouseName: string | null;
}) {
  const r = row.r;
  return {
    id: r.id,
    categoryId: r.categoryId,
    categoryName: row.categoryName,
    description: r.description,
    amount: roundMoney(r.amount),
    paymentMethod: r.paymentMethod,
    warehouseId: r.warehouseId,
    warehouseName: row.warehouseName,
    payee: r.payee,
    frequency: r.frequency,
    nextDueDate: r.nextDueDate,
    active: r.active,
    // Due on or before the end of today (UTC).
    due: r.active && r.nextDueDate.getTime() < Date.now() + 86_400_000 - (Date.now() % 86_400_000),
  };
}

export async function getRecurring(organizationId: string, id: string) {
  if (!isUuid(id)) return null;
  const [row] = await db
    .select({ r: recurringExpenses, categoryName: expenseCategories.name, warehouseName: warehouses.name })
    .from(recurringExpenses)
    .innerJoin(expenseCategories, eq(expenseCategories.id, recurringExpenses.categoryId))
    .leftJoin(warehouses, eq(warehouses.id, recurringExpenses.warehouseId))
    .where(and(eq(recurringExpenses.id, id), eq(recurringExpenses.organizationId, organizationId)))
    .limit(1);
  return row ? shapeRecurring(row) : null;
}

/**
 * Records the occurrence due on [dueDate] and moves the next due date on,
 * in one statement: if someone else recorded it first (the due date has
 * already moved), nothing is recorded and null is returned.
 */
export async function recordRecurring(entry: {
  organizationId: string;
  userId: string;
  recurringId: string;
  dueDate: Date;
  next: Date;
  amount: number;
  expenseDate: Date;
}) {
  const id = randomUUID();
  const { rows } = await db.execute<{ id: string }>(sql`
    WITH r AS (
      UPDATE "recurring_expenses" SET "nextDueDate" = ${entry.next.toISOString()}::timestamp, "updatedAt" = now()
      WHERE "id" = ${entry.recurringId} AND "organizationId" = ${entry.organizationId}
        AND "nextDueDate" = ${entry.dueDate.toISOString()}::timestamp
      RETURNING *
    ),
    n AS (
      UPDATE "organizations" SET "expenseSeq" = "expenseSeq" + 1
      WHERE "id" = ${entry.organizationId} AND EXISTS (SELECT 1 FROM r)
      RETURNING "expenseSeq"
    )
    INSERT INTO "expenses" (
      "id", "organizationId", "number", "reference", "categoryId", "description", "amount", "expenseDate",
      "paymentMethod", "warehouseId", "payee", "recurringId", "createdBy", "clientRef"
    )
    SELECT
      ${id}, ${entry.organizationId}, n."expenseSeq",
      'EXP-' || CASE WHEN n."expenseSeq" < 10000 THEN lpad(n."expenseSeq"::text, 4, '0') ELSE n."expenseSeq"::text END,
      r."categoryId", r."description", ${entry.amount}, ${entry.expenseDate.toISOString()}::timestamp,
      r."paymentMethod", r."warehouseId", r."payee", r."id", ${entry.userId},
      ${`recurring:${entry.recurringId}:${entry.dueDate.toISOString()}`}
    FROM n, r
    RETURNING "id"
  `);
  return rows[0]?.id ?? null;
}
