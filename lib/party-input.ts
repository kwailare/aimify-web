// Validation for the fields of a supplier or customer. Shared by both
// because they are the same kind of record: a named business or person with
// contact details (customers also carry a credit limit).

export type PartyFields = {
  name?: string;
  contactPerson?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
  creditLimit?: number;
  status?: string;
};

type ParseResult = { data: PartyFields } | { error: string };

const OPTIONAL_TEXT = [
  ["contactPerson", 120],
  ["phone", 60],
  ["email", 200],
  ["address", 300],
  ["notes", 1000],
] as const;

export const PARTY_STATUSES = ["active", "archived"] as const;

export function parsePartyFields(
  body: unknown,
  options: { allowContactPerson: boolean; allowCreditLimit: boolean },
): ParseResult {
  if (!body || typeof body !== "object") {
    return { error: "A JSON body is required." };
  }

  const input = body as Record<string, unknown>;
  const data: PartyFields = {};

  if ("name" in input) {
    if (typeof input.name !== "string" || !input.name.trim()) {
      return { error: "name must be a non-empty string." };
    }
    if (input.name.trim().length > 200) {
      return { error: "name must be at most 200 characters." };
    }
    data.name = input.name.trim();
  }

  for (const [key, max] of OPTIONAL_TEXT) {
    if (!(key in input)) continue;

    if (key === "contactPerson" && !options.allowContactPerson) {
      return { error: "contactPerson is only used for suppliers." };
    }

    const value = input[key];

    if (value === null) {
      data[key] = null;
    } else if (typeof value === "string" && value.length <= max) {
      data[key] = value.trim() || null;
    } else {
      return {
        error: `${key} must be a string of at most ${max} characters or null.`,
      };
    }
  }

  if ("creditLimit" in input) {
    if (!options.allowCreditLimit) {
      return { error: "creditLimit is only used for customers." };
    }
    const value = input.creditLimit;

    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      return { error: "creditLimit must be a non-negative number." };
    }
    data.creditLimit = value;
  }

  if ("status" in input) {
    if (
      typeof input.status !== "string" ||
      !(PARTY_STATUSES as readonly string[]).includes(input.status)
    ) {
      return { error: `status must be one of: ${PARTY_STATUSES.join(", ")}.` };
    }
    data.status = input.status;
  }

  return { data };
}
