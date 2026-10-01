import { NextResponse } from "next/server";
import { and, asc, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { customers, suppliers } from "@/db/schema";
import { guardApi } from "@/lib/api-context";
import { logAudit } from "@/lib/audit";
import { roundMoney, type PartyType } from "@/lib/credit";
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
    read: "customers.read" as Permission,
    write: "customers.write" as Permission,
    contactPerson: false,
    creditLimit: true,
  },
  supplier: {
    table: suppliers,
    plural: "suppliers",
    label: "Supplier",
    read: "suppliers.read" as Permission,
    write: "suppliers.write" as Permission,
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

export async function listParties(request: Request, type: PartyType) {
  const config = CONFIG[type];
  const context = await guardApi(request, config.read);

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
    [config.plural]: (rows as Row[]).map((row) => withBalance(row)),
  });
}

export async function createParty(request: Request, type: PartyType) {
  const config = CONFIG[type];
  const context = await guardApi(request, config.write);

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
    { [type]: withBalance(created as Row) },
    { status: 201 },
  );
}

export async function getParty(request: Request, type: PartyType, id: string) {
  const config = CONFIG[type];
  const context = await guardApi(request, config.read);

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
    [type]: withBalance(row as Row),
  });
}

export async function updateParty(request: Request, type: PartyType, id: string) {
  const config = CONFIG[type];
  const context = await guardApi(request, config.write);

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

  if (Object.keys(data).length === 0) {
    return NextResponse.json(
      { error: "Send at least one field to update." },
      { status: 400 },
    );
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
    action: `${type}.updated`,
    recordId: id,
    previousValue,
    newValue,
  });

  return NextResponse.json({
    [type]: withBalance(updatedRow),
  });
}

// Archives rather than deletes: the credit history has to stay intact.
export async function archiveParty(request: Request, type: PartyType, id: string) {
  const config = CONFIG[type];
  const context = await guardApi(request, config.write);

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
    [type]: withBalance(archived as Row),
  });
}
