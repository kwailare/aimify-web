import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs, organizations, users } from "@/db/schema";

const actionLabels: Record<string, string> = {
  "user.signed_up": "Account created",
  "user.signed_in": "Signed in",
  "user.password_reset": "Password reset",
  "auth.password_reset_requested": "Requested a password reset",
  "profile.updated": "Profile updated",
  "organization.created": "Organization created",
  "subscription.activated": "Subscription activated",
  "organization.suspended": "Organization suspended",
  "organization.reactivated": "Organization reactivated",
  "organization.updated": "Organization profile updated",
  "organization.logo_updated": "Company logo updated",
  "organization.logo_removed": "Company logo removed",
  "product.image_updated": "Product image updated",
  "product.image_removed": "Product image removed",
  "subscription.expired": "Trial expired",
  "subscription.cancelled": "Subscription cancelled",
  "user.password_changed": "Password changed",
  "user.password_reset_completed": "Password reset by email link",
  "product.created": "Product created",
  "product.updated": "Product updated",
  "product.archived": "Product archived",
  "warehouse.created": "Warehouse created",
  "warehouse.updated": "Warehouse updated",
};

export function describeAuditAction(action: string) {
  return actionLabels[action] ?? action;
}

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

export async function getAllAuditLogs(limit = 50) {
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
      organizationName: organizations.name,
    })
    .from(auditLogs)
    .leftJoin(users, eq(auditLogs.userId, users.id))
    .leftJoin(organizations, eq(auditLogs.organizationId, organizations.id))
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit);
}
