import { NextResponse } from "next/server";
import { and, asc, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { customers, customerTypes } from "@/db/schema";
import { guardApi } from "@/lib/api-context";
import { logAudit } from "@/lib/audit";
import { roundMoney } from "@/lib/credit";
import { isUuid } from "@/lib/validation";

// Customer types: each organization's own list (Retail, Wholesale, ...).
// Anyone who can see customers can read it; Owners and Administrators
// manage it (customers.types). A type can suggest the credit limit for new
// customers of that type.

export const DEFAULT_CUSTOMER_TYPES = ["Retail", "Wholesale", "Distributor", "Corporate"];

export async function seedDefaultCustomerTypes(organizationId: string) {
  await db
    .insert(customerTypes)
    .values(DEFAULT_CUSTOMER_TYPES.map((name) => ({ organizationId, name })))
    .onConflictDoNothing();
}

type TypeFields = { name?: string; defaultCreditLimit?: number; defaultPaymentTermsDays?: number };

function parseTypeFields(body: unknown): { data: TypeFields } | { error: string } {
  if (!body || typeof body !== "object") return { error: "A JSON body is required." };
  const input = body as Record<string, unknown>;
  const data: TypeFields = {};
  if ("name" in input) {
    const name = typeof input.name === "string" ? input.name.trim() : "";
    if (!name || name.length > 60) {
      return { error: "name is required and must be at most 60 characters." };
    }
    data.name = name;
  }
  if ("defaultCreditLimit" in input) {
    const value = input.defaultCreditLimit;
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      return { error: "defaultCreditLimit must be a non-negative number." };
    }
    data.defaultCreditLimit = roundMoney(value);
  }
  if ("defaultPaymentTermsDays" in input) {
    const value = input.defaultPaymentTermsDays;
    if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 365) {
      return { error: "defaultPaymentTermsDays must be a whole number of days from 0 to 365." };
    }
    data.defaultPaymentTermsDays = value;
  }
  return { data };
}

function shape(row: typeof customerTypes.$inferSelect, customerCount = 0) {
  return {
    id: row.id,
    name: row.name,
    defaultCreditLimit: roundMoney(row.defaultCreditLimit),
    defaultPaymentTermsDays: row.defaultPaymentTermsDays,
    customerCount,
  };
}

const notFound = () => NextResponse.json({ error: "Customer type not found." }, { status: 404 });

async function nameTaken(organizationId: string, name: string, exceptId?: string) {
  const conditions = [
    eq(customerTypes.organizationId, organizationId),
    sql`lower(${customerTypes.name}) = lower(${name})`,
  ];
  if (exceptId) conditions.push(ne(customerTypes.id, exceptId));
  const [row] = await db.select({ id: customerTypes.id }).from(customerTypes).where(and(...conditions)).limit(1);
  return Boolean(row);
}

async function countCustomers(organizationId: string, typeId?: string) {
  const rows = await db
    .select({ typeId: customers.customerTypeId, count: sql<number>`count(*)::int` })
    .from(customers)
    .where(
      and(
        eq(customers.organizationId, organizationId),
        typeId ? eq(customers.customerTypeId, typeId) : sql`${customers.customerTypeId} is not null`,
      ),
    )
    .groupBy(customers.customerTypeId);
  return new Map(rows.map((r) => [r.typeId, r.count]));
}

/** The type with that id in the organization, or null. */
export async function findCustomerType(organizationId: string, id: string) {
  if (!isUuid(id)) return null;
  const [row] = await db
    .select()
    .from(customerTypes)
    .where(and(eq(customerTypes.id, id), eq(customerTypes.organizationId, organizationId)))
    .limit(1);
  return row ?? null;
}

export async function listCustomerTypes(request: Request) {
  const context = await guardApi(request, "customers.view");
  if (context instanceof NextResponse) return context;

  const [rows, counts] = await Promise.all([
    db
      .select()
      .from(customerTypes)
      .where(eq(customerTypes.organizationId, context.organizationId))
      .orderBy(asc(customerTypes.name)),
    countCustomers(context.organizationId),
  ]);
  return NextResponse.json({ customerTypes: rows.map((r) => shape(r, counts.get(r.id) ?? 0)) });
}

export async function createCustomerType(request: Request) {
  const context = await guardApi(request, "customers.types");
  if (context instanceof NextResponse) return context;

  const parsed = parseTypeFields(await request.json().catch(() => null));
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { name, defaultCreditLimit = 0, defaultPaymentTermsDays = 30 } = parsed.data;
  if (!name) return NextResponse.json({ error: "name is required." }, { status: 400 });

  if (await nameTaken(context.organizationId, name)) {
    return NextResponse.json({ error: "This customer type already exists." }, { status: 409 });
  }

  const [created] = await db
    .insert(customerTypes)
    .values({ organizationId: context.organizationId, name, defaultCreditLimit, defaultPaymentTermsDays })
    .returning();

  await logAudit({
    organizationId: context.organizationId,
    userId: context.userId,
    module: "customer",
    action: "customer_type.created",
    recordId: created.id,
    newValue: { name, defaultCreditLimit, defaultPaymentTermsDays },
  });

  return NextResponse.json({ customerType: shape(created) }, { status: 201 });
}

export async function updateCustomerType(request: Request, id: string) {
  const context = await guardApi(request, "customers.types");
  if (context instanceof NextResponse) return context;

  const before = await findCustomerType(context.organizationId, id);
  if (!before) return notFound();

  const parsed = parseTypeFields(await request.json().catch(() => null));
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json(
      { error: "Send name, defaultCreditLimit or defaultPaymentTermsDays." },
      { status: 400 },
    );
  }
  if (parsed.data.name && (await nameTaken(context.organizationId, parsed.data.name, id))) {
    return NextResponse.json({ error: "This customer type already exists." }, { status: 409 });
  }

  const [updated] = await db
    .update(customerTypes)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(and(eq(customerTypes.id, id), eq(customerTypes.organizationId, context.organizationId)))
    .returning();

  await logAudit({
    organizationId: context.organizationId,
    userId: context.userId,
    module: "customer",
    action: "customer_type.updated",
    recordId: id,
    previousValue: {
      name: before.name,
      defaultCreditLimit: before.defaultCreditLimit,
      defaultPaymentTermsDays: before.defaultPaymentTermsDays,
    },
    newValue: {
      name: updated.name,
      defaultCreditLimit: updated.defaultCreditLimit,
      defaultPaymentTermsDays: updated.defaultPaymentTermsDays,
    },
  });

  const counts = await countCustomers(context.organizationId, id);
  return NextResponse.json({ customerType: shape(updated, counts.get(id) ?? 0) });
}

// A type still given to customers (archived ones included) can't be
// removed: change those customers first.
export async function deleteCustomerType(request: Request, id: string) {
  const context = await guardApi(request, "customers.types");
  if (context instanceof NextResponse) return context;

  const type = await findCustomerType(context.organizationId, id);
  if (!type) return notFound();

  const used = (await countCustomers(context.organizationId, id)).get(id) ?? 0;
  if (used > 0) {
    return NextResponse.json(
      {
        error: `${used} customer${used === 1 ? " is" : "s are"} of this type. Change ${used === 1 ? "it" : "them"} first.`,
        code: "type_in_use",
        customerCount: used,
      },
      { status: 409 },
    );
  }

  await db.delete(customerTypes).where(eq(customerTypes.id, id));

  await logAudit({
    organizationId: context.organizationId,
    userId: context.userId,
    module: "customer",
    action: "customer_type.deleted",
    recordId: id,
    previousValue: { name: type.name },
  });

  return NextResponse.json({ deleted: true });
}
