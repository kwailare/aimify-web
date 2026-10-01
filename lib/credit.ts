import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { customers, suppliers } from "@/db/schema";

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

function tableFor(partyType: PartyType) {
  return partyType === "customer" ? customers : suppliers;
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
  const table = tableFor(partyType);
  const [party] = await db
    .select({ id: table.id, status: table.status })
    .from(table)
    .where(and(eq(table.id, partyId), eq(table.organizationId, organizationId)))
    .limit(1);

  return party ?? null;
}

// What is owed on one party right now. `balance` is a stored, atomically
// updated column (see applyBalanceChange), not a sum over credit_entries, so
// this is a plain read with no aggregation.
export async function balanceOf(
  organizationId: string,
  partyType: PartyType,
  partyId: string,
) {
  const table = tableFor(partyType);
  const [row] = await db
    .select({ balance: table.balance })
    .from(table)
    .where(and(eq(table.id, partyId), eq(table.organizationId, organizationId)))
    .limit(1);

  return roundMoney(row?.balance ?? 0);
}

// Balances for every party of one type in an organization, keyed by id.
export async function balancesFor(organizationId: string, partyType: PartyType) {
  const table = tableFor(partyType);
  const rows = await db
    .select({ id: table.id, balance: table.balance })
    .from(table)
    .where(eq(table.organizationId, organizationId));

  return new Map(rows.map((row) => [row.id, roundMoney(row.balance)]));
}

export type ApplyResult =
  | { ok: true; previousBalance: number; newBalance: number }
  | { ok: false; currentBalance: number };

// Moves a party's stored balance by `signed` in a single atomic UPDATE. When
// `requireNonNegative` is set (a real payment), the WHERE clause itself
// checks the resulting balance, so the guard is evaluated by Postgres against
// the row's current value under its normal row-level locking - not against a
// value read earlier in application code. Two concurrent requests can no
// longer both "see" the same starting balance and both be accepted: whichever
// UPDATE commits first changes the balance the second one's WHERE clause is
// evaluated against.
export async function applyBalanceChange(
  organizationId: string,
  partyType: PartyType,
  partyId: string,
  signed: number,
  requireNonNegative: boolean,
): Promise<ApplyResult> {
  const table = tableFor(partyType);
  const conditions = [eq(table.id, partyId), eq(table.organizationId, organizationId)];

  if (requireNonNegative) {
    conditions.push(gte(sql`${table.balance} + ${signed}`, 0));
  }

  const [updated] = await db
    .update(table)
    .set({
      balance: sql`${table.balance} + ${signed}`,
      updatedAt: new Date(),
    })
    .where(and(...conditions))
    .returning({ balance: table.balance });

  if (updated) {
    return {
      ok: true,
      previousBalance: roundMoney(updated.balance - signed),
      newBalance: roundMoney(updated.balance),
    };
  }

  // Either the party doesn't exist (the caller already checked via
  // findParty) or, for a payment, applying it would have taken the balance
  // below zero. Report the current balance either way.
  return { ok: false, currentBalance: await balanceOf(organizationId, partyType, partyId) };
}

// Exactly undoes a previously applied change. Used only when we discover,
// after the fact, that the credit_entries row for this change was never
// actually recorded (we lost a clientRef race to a concurrent identical
// request) - so the balance update must never have "happened" either. Never
// guarded: a reversal must always be able to complete.
export async function reverseBalanceChange(
  organizationId: string,
  partyType: PartyType,
  partyId: string,
  signed: number,
) {
  await applyBalanceChange(organizationId, partyType, partyId, -signed, false);
}
