import { and, count, lt, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs } from "@/db/schema";

function condition(before: Date | null, extra?: SQL) {
  return and(before ? lt(auditLogs.createdAt, before) : undefined, extra);
}

export async function countAuditLogs(before: Date | null, extra?: SQL) {
  const [row] = await db
    .select({ value: count() })
    .from(auditLogs)
    .where(condition(before, extra));

  return row?.value ?? 0;
}

export async function deleteAuditLogs(before: Date | null, extra?: SQL) {
  const removed = await db
    .delete(auditLogs)
    .where(condition(before, extra))
    .returning({ id: auditLogs.id });

  return removed.length;
}
