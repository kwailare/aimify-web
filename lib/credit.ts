import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { creditEntries, customers, suppliers } from "@/db/schema";

export const PARTY_TYPES = ["customer", "supplier"] as const;
export type PartyType = (typeof PARTY_TYPES)[number];

export const ENTRY_KINDS = ["charge", "payment", "adjustment"] as const;
export type EntryKind = (typeof ENTRY_KINDS)[number];

export function isPartyType(value: unknown): value is PartyType {
  return (PARTY_TYPES as readonly string[]).includes(value as string);
}

export function isEntryKind(value: unknown): value is EntryKind {
  return (ENTRY_KINDS as readonly string[]).includes(value as string);
}

// Cents-safe arithmetic: amounts are stored as numeric and compared to two
// decimals so floating-point dust can't fail a "pay it in full" payment.
export function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

// The signed amount stored for an entry. A charge raises what is owed, a
// payment lowers it, and an adjustment is signed by the caller.
export function signedAmount(kind: EntryKind, amount: number) {
  if (kind === "charge") return roundMoney(Math.abs(amount));
  if (kind === "payment") return -roundMoney(Math.abs(amount));
  return roundMoney(amount);
}

export async function findParty(
  organizationId: string,
  partyType: PartyType,
  partyId: string,
) {
  const table = partyType === "customer" ? customers : suppliers;
  const [party] = await db
    .select({ id: table.id, status: table.status })
    .from(table)
    .where(and(eq(table.id, partyId), eq(table.organizationId, organizationId)))
    .limit(1);

  return party ?? null;
}

// What is owed on one party right now: the sum of its ledger entries.
export async function balanceOf(
  organizationId: string,
  partyType: PartyType,
  partyId: string,
) {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${creditEntries.amount}), 0)::float8` })
    .from(creditEntries)
    .where(
      and(
        eq(creditEntries.organizationId, organizationId),
        eq(creditEntries.partyType, partyType),
        eq(creditEntries.partyId, partyId),
      ),
    );

  return roundMoney(row?.total ?? 0);
}

// Balances for every party of one type in an organization, keyed by id.
export async function balancesFor(
  organizationId: string,
  partyType: PartyType,
) {
  const rows = await db
    .select({
      partyId: creditEntries.partyId,
      total: sql<number>`coalesce(sum(${creditEntries.amount}), 0)::float8`,
    })
    .from(creditEntries)
    .where(
      and(
        eq(creditEntries.organizationId, organizationId),
        eq(creditEntries.partyType, partyType),
      ),
    )
    .groupBy(creditEntries.partyId);

  return new Map(rows.map((row) => [row.partyId, roundMoney(row.total)]));
}
