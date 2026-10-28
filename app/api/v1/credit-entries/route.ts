import { NextResponse } from "next/server";
import { and, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { creditAllocations, creditEntries, purchases, sales } from "@/db/schema";
import { denyIfForbidden, guardApi } from "@/lib/api-context";
import { logAudit } from "@/lib/audit";
import { balanceOf, isEntryKind, isPartyType, roundMoney } from "@/lib/credit";
import { callDbFunction } from "@/lib/db-functions";
import { PAYMENT_METHODS } from "@/lib/sales";
import { isUuid } from "@/lib/validation";

// What each payment or credit settled, oldest first: the sale or purchase
// reference (or the entry's note for a debt that isn't one) and the amount.
async function allocationsFor(organizationId: string, entryIds: string[]) {
  const byCredit = new Map<string, { reference: string; amount: number; debitEntryId: string }[]>();
  if (entryIds.length === 0) return byCredit;
  const debit = alias(creditEntries, "debit");
  const rows = await db
    .select({
      creditEntryId: creditAllocations.creditEntryId,
      debitEntryId: creditAllocations.debitEntryId,
      amount: creditAllocations.amount,
      saleRef: sales.reference,
      purchaseRef: purchases.reference,
      note: debit.note,
    })
    .from(creditAllocations)
    .innerJoin(debit, eq(debit.id, creditAllocations.debitEntryId))
    .leftJoin(sales, eq(sales.id, debit.saleId))
    .leftJoin(purchases, eq(purchases.id, debit.purchaseId))
    .where(
      and(
        eq(creditAllocations.organizationId, organizationId),
        inArray(creditAllocations.creditEntryId, entryIds),
      ),
    )
    // The order they were settled in: oldest due first.
    .orderBy(creditAllocations.createdAt, debit.dueDate, debit.createdAt, debit.id);
  for (const row of rows) {
    const list = byCredit.get(row.creditEntryId!) ?? [];
    list.push({
      reference: row.saleRef ?? row.purchaseRef ?? row.note ?? "Earlier balance",
      amount: roundMoney(row.amount),
      debitEntryId: row.debitEntryId,
    });
    byCredit.set(row.creditEntryId!, list);
  }
  return byCredit;
}

function shapeEntry(
  entry: typeof creditEntries.$inferSelect,
  allocations: Map<string, { reference: string; amount: number; debitEntryId: string }[]>,
) {
  return {
    ...entry,
    amount: roundMoney(entry.amount),
    openAmount: roundMoney(entry.openAmount),
    ...(entry.amount < 0 ? { allocations: allocations.get(entry.id) ?? [] } : {}),
  };
}

const MAX_LIMIT = 1000;

// The credit ledger. A customer's balance is what they owe us; a supplier's
// is what we owe them; positive always means "still owed".

export async function GET(request: Request) {
  const context = await guardApi(request);

  if (context instanceof NextResponse) return context;

  const { searchParams } = new URL(request.url);
  const partyType = searchParams.get("partyType");
  const partyId = searchParams.get("partyId");

  if (partyType !== null && !isPartyType(partyType)) {
    return NextResponse.json(
      { error: "partyType must be customer or supplier." },
      { status: 400 },
    );
  }

  if (partyId !== null && !isUuid(partyId)) {
    return NextResponse.json(
      { error: "partyId must be a valid id." },
      { status: 400 },
    );
  }

  // Someone may read the customer ledger without the supplier one (and the
  // other way round), so each type needs its own read permission.
  const readable = (["customer", "supplier"] as const).filter((type) =>
    context.permissions.has(type === "customer" ? "customers.view" : "suppliers.view"),
  );
  const wanted = partyType ? [partyType] : readable;

  if (partyType) {
    const denied = denyIfForbidden(
      context,
      partyType === "customer" ? "customers.view" : "suppliers.view",
    );

    if (denied) return denied;
  }

  // A period, for statements: entries from `from` (inclusive) up to `to`
  // (exclusive). With one party, `openingBalance` is what was owed before
  // `from`.
  const parseDate = (value: string | null) => {
    if (value === null) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  };
  const from = parseDate(searchParams.get("from"));
  const to = parseDate(searchParams.get("to"));

  if (from === undefined || to === undefined) {
    return NextResponse.json({ error: "from and to must be dates." }, { status: 400 });
  }

  const requestedLimit = Number(searchParams.get("limit"));
  const limit =
    Number.isInteger(requestedLimit) && requestedLimit > 0
      ? Math.min(requestedLimit, MAX_LIMIT)
      : 100;

  const rows = [];

  for (const type of wanted) {
    const conditions = [
      eq(creditEntries.organizationId, context.organizationId),
      eq(creditEntries.partyType, type),
    ];

    if (partyId) conditions.push(eq(creditEntries.partyId, partyId));
    if (from) conditions.push(gte(creditEntries.createdAt, from));
    if (to) conditions.push(lt(creditEntries.createdAt, to));

    rows.push(
      ...(await db
        .select()
        .from(creditEntries)
        .where(and(...conditions))
        .orderBy(desc(creditEntries.createdAt))
        .limit(limit)),
    );
  }

  rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  let openingBalance: number | undefined;

  if (partyId && partyType && from) {
    const [row] = await db
      .select({ total: sql<number>`coalesce(sum(${creditEntries.amount}), 0)::float8` })
      .from(creditEntries)
      .where(
        and(
          eq(creditEntries.organizationId, context.organizationId),
          eq(creditEntries.partyType, partyType),
          eq(creditEntries.partyId, partyId),
          lt(creditEntries.createdAt, from),
        ),
      );
    openingBalance = Math.round(Number(row?.total ?? 0) * 100) / 100;
  }

  const shown = rows.slice(0, limit);
  const allocations = await allocationsFor(
    context.organizationId,
    shown.filter((e) => e.amount < 0).map((e) => e.id),
  );

  return NextResponse.json({
    entries: shown.map((e) => shapeEntry(e, allocations)),
    ...(openingBalance === undefined ? {} : { openingBalance }),
  });
}

export async function POST(request: Request) {
  const context = await guardApi(request, "credit.record");

  if (context instanceof NextResponse) return context;

  const body = await request.json().catch(() => null);

  const partyType = body?.partyType;
  const partyId = body?.partyId;
  const kind = body?.kind;
  const amount = body?.amount;
  const note = typeof body?.note === "string" ? body.note.trim() : null;
  const clientRef = typeof body?.clientRef === "string" ? body.clientRef : null;
  const method = body?.method ?? null;

  if (!isPartyType(partyType) || !isUuid(partyId) || !isEntryKind(kind)) {
    return NextResponse.json(
      {
        error:
          "partyType (customer or supplier), a valid partyId and kind (charge, payment or adjustment) are required.",
      },
      { status: 400 },
    );
  }

  const cannotSee = denyIfForbidden(
    context,
    partyType === "customer" ? "customers.view" : "suppliers.view",
  );

  if (cannotSee) return cannotSee;

  if (typeof amount !== "number" || !Number.isFinite(amount) || amount === 0) {
    return NextResponse.json(
      { error: "amount must be a non-zero number." },
      { status: 400 },
    );
  }

  if (kind !== "adjustment" && amount < 0) {
    return NextResponse.json(
      { error: `amount for a ${kind} must be positive.` },
      { status: 400 },
    );
  }

  if (note && note.length > 500) {
    return NextResponse.json(
      { error: "note must be at most 500 characters." },
      { status: 400 },
    );
  }

  if (clientRef !== null && (clientRef.length === 0 || clientRef.length > 100)) {
    return NextResponse.json(
      { error: "clientRef must be 1 to 100 characters." },
      { status: 400 },
    );
  }

  if (method !== null && (kind !== "payment" || !(PAYMENT_METHODS as readonly string[]).includes(method))) {
    return NextResponse.json(
      { error: `method is for payments only, one of: ${PAYMENT_METHODS.join(", ")}.` },
      { status: 400 },
    );
  }

  // One step in the database: the balance, the entry, its due date or
  // receipt number, and settling the oldest debts with a payment or credit.
  const outcome = await callDbFunction(
    sql`select aimify_record_credit(
      ${context.organizationId}::uuid, ${context.userId}::uuid, ${partyType}, ${partyId}::uuid,
      ${kind}, ${amount}::numeric, ${note || null}, ${method}, ${clientRef}
    ) as result`,
    {
      party_not_found: {
        status: 404,
        error: `${partyType === "customer" ? "Customer" : "Supplier"} not found.`,
      },
      overpayment: {
        status: 400,
        error: "This payment is more than the balance owed.",
        describe: (d) =>
          typeof d.balanceOwed === "number" ? `This payment is more than the balance owed (${d.balanceOwed}).` : null,
      },
    },
  );

  if (!outcome.ok) return NextResponse.json(outcome.body, { status: outcome.status });

  const result = outcome.result as {
    duplicate: boolean;
    entryId: string;
    previousBalance?: number;
    balanceOwed?: number;
  };
  const [entry] = await db.select().from(creditEntries).where(eq(creditEntries.id, result.entryId)).limit(1);
  const allocations = await allocationsFor(context.organizationId, [entry.id]);

  // A retried request (an offline change sent again) gets the entry that
  // already exists instead of a second one.
  if (result.duplicate) {
    return NextResponse.json({
      entry: shapeEntry(entry, allocations),
      balanceOwed: await balanceOf(context.organizationId, partyType, partyId),
      duplicate: true,
    });
  }

  await logAudit({
    organizationId: context.organizationId,
    userId: context.userId,
    module: partyType,
    action: `${partyType}.credit_${kind}`,
    recordId: partyId,
    previousValue: { balanceOwed: result.previousBalance },
    newValue: {
      balanceOwed: result.balanceOwed,
      amount: entry.amount,
      ...(entry.receiptNumber ? { receiptNumber: entry.receiptNumber } : {}),
    },
  });

  return NextResponse.json(
    { entry: shapeEntry(entry, allocations), balanceOwed: result.balanceOwed },
    { status: 201 },
  );
}
