import { and, eq } from "drizzle-orm";
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

// What is owed on one party right now. `balance` is a stored column kept by
// the database functions (aimify_record_credit and the sale and purchase
// functions), not a sum over credit_entries, so this is a plain read.
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
