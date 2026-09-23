import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { loginAttempts } from "@/db/schema";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILED_ATTEMPTS = 5;

type HeaderLike = { get(name: string): string | null };

export function getClientIp(headers: HeaderLike): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return headers.get("x-real-ip") ?? "unknown";
}

export async function isRateLimited(identifiers: string[]): Promise<boolean> {
  if (identifiers.length === 0) return false;

  const windowStart = new Date(Date.now() - WINDOW_MS);

  for (const identifier of identifiers) {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(loginAttempts)
      .where(
        and(
          eq(loginAttempts.identifier, identifier),
          eq(loginAttempts.success, false),
          gte(loginAttempts.createdAt, windowStart),
        ),
      );

    if ((row?.count ?? 0) >= MAX_FAILED_ATTEMPTS) {
      return true;
    }
  }

  return false;
}

export async function recordLoginAttempt(
  identifiers: string[],
  success: boolean,
) {
  if (identifiers.length === 0) return;

  await db
    .insert(loginAttempts)
    .values(identifiers.map((identifier) => ({ identifier, success })));
}
