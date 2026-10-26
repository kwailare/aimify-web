import { NextResponse } from "next/server";
import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { customers, customerTypes, sales, suppliers } from "@/db/schema";
import { denyIfChangeForbidden, guardApi } from "@/lib/api-context";
import { logAudit } from "@/lib/audit";
import { roundMoney, type PartyType } from "@/lib/credit";
import { findCustomerType } from "@/lib/customer-types";
import { parsePartyFields } from "@/lib/party-input";
import type { Permission } from "@/lib/permissions";
import { isUuid } from "@/lib/validation";

// The customer and supplier endpoints are the same shape — a named record
// with contact details and a credit balance — so both route files are thin
// wrappers over these handlers.

const CONFIG = {
  customer: {
    table: customers,
    plural: "customers",
    label: "Customer",
    view: "customers.view" as Permission,
    create: "customers.create" as Permission,
    edit: "customers.edit" as Permission,
    archive: "customers.archive" as Permission,
    contactPerson: false,
    creditLimit: true,
  },
  supplier: {
    table: suppliers,
    plural: "suppliers",
    label: "Supplier",
    view: "suppliers.view" as Permission,
    create: "suppliers.create" as Permission,
    edit: "suppliers.edit" as Permission,
    archive: "suppliers.archive" as Permission,
    contactPerson: true,
    creditLimit: false,
  },
} as const;

const notFound = (type: PartyType) =>
  NextResponse.json(
    { error: `${CONFIG[type].label} not found.` },
    { status: 404 },
  );

type Row = Record<string, unknown> & { id: string; balance: number };

// `balance` is an authoritative, atomically updated column on the row
// itself (see lib/credit.ts), so shaping the response is just a rename -
// no separate balance lookup needed.
function withBalance(row: Row) {
  const { balance, ...rest } = row;
  return { ...rest, balanceOwed: roundMoney(balance) };
}

// Customers also carry their type's name and what they have bought
// (completed sales only: voided ones don't count).
async function shapeRows(type: PartyType, organizationId: string, rows: Row[]) {
  const shaped = rows.map(withBalance);
  if (type !== "customer" || rows.length === 0) return shaped;

  const ids = rows.map((r) => r.id);
  const [types, totals] = await Promise.all([
    db
      .select({ id: customerTypes.id, name: customerTypes.name })
      .from(customerTypes)
      .where(eq(customerTypes.organizationId, organizationId)),
    db
      .select({
        customerId: sales.customerId,
        total: sql<number>`coalesce(sum(${sales.total}), 0)::float8`,
        count: sql<number>`count(*)::int`,
        last: sql<Date | null>`max(${sales.saleDate})`.mapWith(sales.saleDate),
      })
      .from(sales)
      .where(
        and(
          eq(sales.organizationId, organizationId),
          eq(sales.status, "completed"),
          ids.length === 1 ? eq(sales.customerId, ids[0]) : inArray(sales.customerId, ids),
        ),
      )
      .groupBy(sales.customerId),
  ]);
  const typeName = new Map(types.map((t) => [t.id, t.name]));
  const bought = new Map(totals.map((t) => [t.customerId, t]));

  return shaped.map((row) => {
    const b = bought.get(row.id as string);
    const typeId = (row as Record<string, unknown>).customerTypeId as string | null;
    return {
      ...row,
      customerTypeName: typeId ? (typeName.get(typeId) ?? null) : null,
      totalSales: roundMoney(Number(b?.total ?? 0)),
      salesCount: b?.count ?? 0,
      lastSaleAt: b?.last ? new Date(b.last).toISOString() : null,
    };
  });
}

async function shapeOne(type: PartyType, organizationId: string, row: unknown) {
  return (await shapeRows(type, organizationId, [row as Row]))[0];
}

const badType = () =>
  NextResponse.json({ error: "That customer type doesn't exist." }, { status: 400 });

export async function listParties(request: Request, type: PartyType) {
  const config = CONFIG[type];
  const context = await guardApi(request, config.view);

  if (context instanceof NextResponse) return context;

  const { searchParams } = new URL(request.url);
  const includeArchived = searchParams.get("includeArchived") === "true";

  const conditions = [eq(config.table.organizationId, context.organizationId)];

  if (!includeArchived) {
    conditions.push(ne(config.table.status, "archived"));
  }

  const rows = await db
    .select()
    .from(config.table)
    .where(and(...conditions))
    .orderBy(asc(config.table.name));

  return NextResponse.json({
    [config.plural]: await shapeRows(type, context.organizationId, rows as Row[]),
  });
}

export async function createParty(request: Request, type: PartyType) {
  const config = CONFIG[type];
  const context = await guardApi(request, config.create);

  if (context instanceof NextResponse) return context;

  const body = await request.json().catch(() => null);
  const parsed = parsePartyFields(body, {
    allowContactPerson: config.contactPerson,
    allowCreditLimit: config.creditLimit,
  });

  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { data } = parsed;

  if (!data.name) {
    return NextResponse.json({ error: "name is required." }, { status: 400 });
  }

  // Status is changed by archiving, not by create.
  const values = { ...data, name: data.name };
  delete values.status;

  if (data.customerTypeId) {
    const customerType = await findCustomerType(context.organizationId, data.customerTypeId);
    if (!customerType) return badType();
    if (data.creditLimit === undefined) values.creditLimit = customerType.defaultCreditLimit;
  }

  const [created] = await db
    .insert(config.table)
    .values({ ...values, organizationId: context.organizationId })
    .returning();

  await logAudit({
    organizationId: context.organizationId,
    userId: context.userId,
    module: type,
    action: `${type}.created`,
    recordId: created.id,
    newValue: { name: created.name },
  });

  return NextResponse.json(
    { [type]: await shapeOne(type, context.organizationId, created) },
    { status: 201 },
  );
}

export async function getParty(request: Request, type: PartyType, id: string) {
  const config = CONFIG[type];
  const context = await guardApi(request, config.view);

  if (context instanceof NextResponse) return context;

  if (!isUuid(id)) return notFound(type);

  const [row] = await db
    .select()
    .from(config.table)
    .where(
      and(
        eq(config.table.id, id),
        eq(config.table.organizationId, context.organizationId),
      ),
    )
    .limit(1);

  if (!row) return notFound(type);

  return NextResponse.json({
    [type]: await shapeOne(type, context.organizationId, row),
  });
}

export async function updateParty(request: Request, type: PartyType, id: string) {
  const config = CONFIG[type];
  const context = await guardApi(request);

  if (context instanceof NextResponse) return context;

  if (!isUuid(id)) return notFound(type);

  const body = await request.json().catch(() => null);
  const parsed = parsePartyFields(body, {
    allowContactPerson: config.contactPerson,
    allowCreditLimit: config.creditLimit,
  });

  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { data } = parsed;

  const denied = denyIfChangeForbidden(context, data, {
    status: config.archive,
    fields: config.edit,
  });

  if (denied) return denied;

  if (Object.keys(data).length === 0) {
    return NextResponse.json(
      { error: "Send at least one field to update." },
      { status: 400 },
    );
  }

  if (data.customerTypeId && !(await findCustomerType(context.organizationId, data.customerTypeId))) {
    return badType();
  }

  const [before] = await db
    .select()
    .from(config.table)
    .where(
      and(
        eq(config.table.id, id),
        eq(config.table.organizationId, context.organizationId),
      ),
    )
    .limit(1);

  if (!before) return notFound(type);

  const [updated] = await db
    .update(config.table)
    .set({ ...data, updatedAt: new Date() })
    .where(
      and(
        eq(config.table.id, id),
        eq(config.table.organizationId, context.organizationId),
      ),
    )
    .returning();

  if (!updated) return notFound(type);

  const previousValue: Record<string, unknown> = {};
  const newValue: Record<string, unknown> = {};
  const beforeRow = before as Row;
  const updatedRow = updated as Row;

  for (const key of Object.keys(data)) {
    if (beforeRow[key] !== updatedRow[key]) {
      previousValue[key] = beforeRow[key];
      newValue[key] = updatedRow[key];
    }
  }

  await logAudit({
    organizationId: context.organizationId,
    userId: context.userId,
    module: type,
    action:
      beforeRow.status === "archived" && updatedRow.status === "active"
        ? `${type}.restored`
        : `${type}.updated`,
    recordId: id,
    previousValue,
    newValue,
  });

  return NextResponse.json({
    [type]: await shapeOne(type, context.organizationId, updatedRow),
  });
}

// Archives rather than deletes: the credit history has to stay intact.
export async function archiveParty(request: Request, type: PartyType, id: string) {
  const config = CONFIG[type];
  const context = await guardApi(request, config.archive);

  if (context instanceof NextResponse) return context;

  if (!isUuid(id)) return notFound(type);

  const [archived] = await db
    .update(config.table)
    .set({ status: "archived", updatedAt: new Date() })
    .where(
      and(
        eq(config.table.id, id),
        eq(config.table.organizationId, context.organizationId),
      ),
    )
    .returning();

  if (!archived) return notFound(type);

  await logAudit({
    organizationId: context.organizationId,
    userId: context.userId,
    module: type,
    action: `${type}.archived`,
    recordId: id,
    newValue: { name: archived.name },
  });

  return NextResponse.json({
    [type]: await shapeOne(type, context.organizationId, archived),
  });
}
