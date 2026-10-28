import { NextResponse } from "next/server";
import { and, eq, gt, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { creditEntries, customers, purchases, sales, suppliers } from "@/db/schema";
import { guardApi } from "@/lib/api-context";
import { isPartyType, roundMoney } from "@/lib/credit";

const DAY = 86_400_000;

const BUCKETS = ["current", "days1to30", "days31to60", "days61to90", "over90"] as const;
type Bucket = (typeof BUCKETS)[number];
type Buckets = Record<Bucket, number>;

const emptyBuckets = (): Buckets => ({ current: 0, days1to30: 0, days31to60: 0, days61to90: 0, over90: 0 });

function bucketFor(daysOverdue: number): Bucket {
  if (daysOverdue <= 0) return "current";
  if (daysOverdue <= 30) return "days1to30";
  if (daysOverdue <= 60) return "days31to60";
  if (daysOverdue <= 90) return "days61to90";
  return "over90";
}

// Who owes what and for how long (customers), or what is owed to whom
// (suppliers), as of now. Every debt still open — a sale or purchase, a
// charge, an adjustment up — is placed by how many days past its due date it
// is. Parties are listed when their balance isn't zero (a negative balance is
// a credit in their favour), most overdue first.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const partyType = searchParams.get("partyType") ?? "customer";
  if (!isPartyType(partyType)) {
    return NextResponse.json({ error: "partyType must be customer or supplier." }, { status: 400 });
  }

  const context = await guardApi(request, partyType === "customer" ? "customers.view" : "suppliers.view");
  if (context instanceof NextResponse) return context;

  const table = partyType === "customer" ? customers : suppliers;
  const now = Date.now();

  const [parties, debts, lastPayments] = await Promise.all([
    db
      .select({
        id: table.id,
        name: table.name,
        phone: table.phone,
        email: table.email,
        status: table.status,
        balance: table.balance,
        paymentTermsDays: table.paymentTermsDays,
        ...(partyType === "customer" ? { creditLimit: customers.creditLimit } : {}),
      })
      .from(table)
      .where(and(eq(table.organizationId, context.organizationId), ne(table.balance, 0))),
    db
      .select({
        id: creditEntries.id,
        partyId: creditEntries.partyId,
        kind: creditEntries.kind,
        note: creditEntries.note,
        amount: creditEntries.amount,
        openAmount: creditEntries.openAmount,
        dueDate: creditEntries.dueDate,
        createdAt: creditEntries.createdAt,
        saleId: creditEntries.saleId,
        purchaseId: creditEntries.purchaseId,
        saleRef: sales.reference,
        purchaseRef: purchases.reference,
      })
      .from(creditEntries)
      .leftJoin(sales, eq(sales.id, creditEntries.saleId))
      .leftJoin(purchases, eq(purchases.id, creditEntries.purchaseId))
      .where(
        and(
          eq(creditEntries.organizationId, context.organizationId),
          eq(creditEntries.partyType, partyType),
          gt(creditEntries.openAmount, 0),
        ),
      )
      .orderBy(creditEntries.dueDate, creditEntries.createdAt),
    db
      .select({
        partyId: creditEntries.partyId,
        last: sql<Date | null>`max(${creditEntries.createdAt})`.mapWith(creditEntries.createdAt),
      })
      .from(creditEntries)
      .where(
        and(
          eq(creditEntries.organizationId, context.organizationId),
          eq(creditEntries.partyType, partyType),
          eq(creditEntries.kind, "payment"),
        ),
      )
      .groupBy(creditEntries.partyId),
  ]);

  const lastPaid = new Map(lastPayments.map((p) => [p.partyId, p.last]));
  const itemsByParty = new Map<string, typeof debts>();
  for (const debt of debts) {
    const list = itemsByParty.get(debt.partyId) ?? [];
    list.push(debt);
    itemsByParty.set(debt.partyId, list);
  }

  const totals = { balance: 0, overdue: 0, credit: 0, ...emptyBuckets() };
  const rows = parties.map((party) => {
    const buckets = emptyBuckets();
    let maxDaysOverdue = 0;
    const items = (itemsByParty.get(party.id) ?? []).map((d) => {
      const due = d.dueDate ?? d.createdAt;
      const daysOverdue = Math.max(0, Math.floor((now - due.getTime()) / DAY));
      const open = roundMoney(d.openAmount);
      buckets[bucketFor(daysOverdue)] = roundMoney(buckets[bucketFor(daysOverdue)] + open);
      maxDaysOverdue = Math.max(maxDaysOverdue, daysOverdue);
      return {
        entryId: d.id,
        kind: d.kind,
        reference: d.saleRef ?? d.purchaseRef ?? d.note ?? (d.kind === "charge" ? "Charge" : "Adjustment"),
        saleId: d.saleId,
        purchaseId: d.purchaseId,
        date: d.createdAt,
        dueDate: due,
        amount: roundMoney(d.amount),
        openAmount: open,
        daysOverdue,
      };
    });
    const balance = roundMoney(party.balance);
    const overdue = roundMoney(buckets.days1to30 + buckets.days31to60 + buckets.days61to90 + buckets.over90);
    const last = lastPaid.get(party.id) ?? null;

    totals.balance += Math.max(balance, 0);
    totals.credit += Math.max(-balance, 0);
    totals.overdue += overdue;
    for (const b of BUCKETS) totals[b] += buckets[b];

    return {
      id: party.id,
      name: party.name,
      phone: party.phone,
      email: party.email,
      status: party.status,
      balance,
      creditLimit: "creditLimit" in party ? roundMoney(party.creditLimit as number) : null,
      paymentTermsDays: party.paymentTermsDays,
      buckets,
      overdue,
      maxDaysOverdue,
      oldestDueDate: items[0]?.dueDate ?? null,
      lastPaymentAt: last,
      daysSinceLastPayment: last ? Math.floor((now - last.getTime()) / DAY) : null,
      items,
    };
  });

  rows.sort((a, b) => b.overdue - a.overdue || b.maxDaysOverdue - a.maxDaysOverdue || b.balance - a.balance);

  return NextResponse.json({
    asOf: new Date(now).toISOString(),
    partyType,
    totals: Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, roundMoney(v)])),
    parties: rows,
  });
}
