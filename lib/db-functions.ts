import type { sql } from "drizzle-orm";
import { db } from "@/db";

export type FunctionError = {
  status: number;
  error: string;
  // A more specific message built from the exception's detail, when it has
  // what the message needs.
  describe?: (detail: Record<string, unknown>) => string | null;
};

export type FunctionOutcome =
  | { ok: true; result: Record<string, unknown> }
  | { ok: false; status: number; body: Record<string, unknown> };

// Calls one of the plpgsql functions that do multi-table work in one step
// (purchases, sales), turning the codes they raise into an API error
// ({ status, body }) instead of a 500. Unknown errors are rethrown.
export async function callDbFunction(
  query: ReturnType<typeof sql>,
  errors: Record<string, FunctionError>,
): Promise<FunctionOutcome> {
  try {
    const { rows } = await db.execute<{ result: Record<string, unknown> }>(query);
    return { ok: true, result: rows[0].result };
  } catch (error) {
    const cause =
      (error as { cause?: { message?: string; detail?: string } }).cause ??
      (error as { message?: string; detail?: string });
    const code = cause?.message ?? "";
    const known = errors[code];
    if (!known) throw error;
    let detail: Record<string, unknown> = {};
    try {
      detail = cause.detail ? JSON.parse(cause.detail) : {};
    } catch {
      detail = {};
    }
    const message = known.describe?.(detail) ?? known.error;
    return { ok: false, status: known.status, body: { error: message, code, ...detail } };
  }
}
