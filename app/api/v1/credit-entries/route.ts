import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { creditEntries } from "@/db/schema";
import { denyIfForbidden, guardApi } from "@/lib/api-context";
import { logAudit } from "@/lib/audit";
import {
  balanceOf,
  findParty,
  isEntryKind,
  isPartyType,
  roundMoney,
  signedAmount,
} from "@/lib/credit";
import { can } from "@/lib/permissions";
import { isUuid } from "@/lib/validation";

const MAX_LIMIT = 200;

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
    can(context.role, type === "customer" ? "customers.read" : "suppliers.read"),
  );
  const wanted = partyType ? [partyType] : readable;

  if (partyType) {
    const denied = denyIfForbidden(
      context,
      partyType === "customer" ? "customers.read" : "suppliers.read",
    );

    if (denied) return denied;
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

  return NextResponse.json({ entries: rows.slice(0, limit) });
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

  if (!isPartyType(partyType) || !isUuid(partyId) || !isEntryKind(kind)) {
    return NextResponse.json(
      {
        error:
          "partyType (customer or supplier), a valid partyId and kind (charge, payment or adjustment) are required.",
      },
      { status: 400 },
    );
  }

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

  const party = await findParty(context.organizationId, partyType, partyId);

  if (!party) {
    return NextResponse.json(
      {
        error: `${partyType === "customer" ? "Customer" : "Supplier"} not found.`,
      },
      { status: 404 },
    );
  }

  // A retried request (an offline change sent again) returns the entry that
  // already exists instead of recording it twice.
  if (clientRef) {
    const [existing] = await db
      .select()
      .from(creditEntries)
      .where(
        and(
          eq(creditEntries.organizationId, context.organizationId),
          eq(creditEntries.clientRef, clientRef),
        ),
      )
      .limit(1);

    if (existing) {
      return NextResponse.json({
        entry: existing,
        balanceOwed: await balanceOf(context.organizationId, partyType, partyId),
        duplicate: true,
      });
    }
  }

  const signed = signedAmount(kind, amount);
  const balanceBefore = await balanceOf(context.organizationId, partyType, partyId);

  if (kind === "payment" && roundMoney(-signed) > balanceBefore) {
    return NextResponse.json(
      {
        error: `This payment is more than the balance owed (${balanceBefore}).`,
        code: "overpayment",
        balanceOwed: balanceBefore,
      },
      { status: 400 },
    );
  }

  const [entry] = await db
    .insert(creditEntries)
    .values({
      organizationId: context.organizationId,
      partyType,
      partyId,
      kind,
      amount: signed,
      note: note || null,
      userId: context.userId,
      clientRef,
    })
    .onConflictDoNothing()
    .returning();

  // Lost a race with the same clientRef: hand back the winner.
  if (!entry) {
    const [existing] = await db
      .select()
      .from(creditEntries)
      .where(
        and(
          eq(creditEntries.organizationId, context.organizationId),
          eq(creditEntries.clientRef, clientRef ?? ""),
        ),
      )
      .limit(1);

    return NextResponse.json({
      entry: existing,
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
    previousValue: { balanceOwed: balanceBefore },
    newValue: { balanceOwed: roundMoney(balanceBefore + signed), amount: signed },
  });

  return NextResponse.json(
    {
      entry,
      balanceOwed: roundMoney(balanceBefore + signed),
    },
    { status: 201 },
  );
}
