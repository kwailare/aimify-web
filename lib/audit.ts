import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs, users } from "@/db/schema";

export async function logAudit(entry: {
  organizationId?: string | null;
  userId?: string | null;
  module: string;
  action: string;
  recordId?: string | null;
  previousValue?: unknown;
  newValue?: unknown;
}) {
  await db.insert(auditLogs).values({
    organizationId: entry.organizationId ?? null,
    userId: entry.userId ?? null,
    module: entry.module,
    action: entry.action,
    recordId: entry.recordId ?? null,
    previousValue: entry.previousValue ?? null,
    newValue: entry.newValue ?? null,
  });
}

export async function getRecentAuditLogs(organizationId: string, limit = 20) {
  return db
    .select({
      id: auditLogs.id,
      module: auditLogs.module,
      action: auditLogs.action,
      recordId: auditLogs.recordId,
      previousValue: auditLogs.previousValue,
      newValue: auditLogs.newValue,
      createdAt: auditLogs.createdAt,
      actorName: users.name,
      actorEmail: users.email,
    })
    .from(auditLogs)
    .leftJoin(users, eq(auditLogs.userId, users.id))
    .where(eq(auditLogs.organizationId, organizationId))
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit);
}
