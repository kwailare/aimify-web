import { count, desc, eq, min, or } from "drizzle-orm";
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
  "user.email_verified": "Email address confirmed",
  "admin.email_verified": "Email confirmed by an admin",
  "admin.trial_extended": "Trial extended by an admin",
  "admin.subscription_activated": "Subscription activated by an admin",
  "admin.verification_email_sent": "Confirmation link sent by an admin",
  "admin.activity_cleared": "Activity history cleared",
  "user.password_reset_completed": "Password reset by email link",
  "team.invited": "Teammate invited",
  "team.invite_resent": "Invitation resent",
  "team.invite_revoked": "Invitation revoked",
  "team.invite_accepted": "Invitation accepted",
  "team.role_changed": "Team role changed",
  "team.member_removed": "Team member removed",
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

const SENSITIVE_KEY = /password|token|secret|hash/i;

function formatAuditValue(value: unknown): string {
  if (value === null || value === undefined) return "empty";
  if (typeof value === "string") {
    return value.length > 60 ? `${value.slice(0, 57)}...` : value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  const json = JSON.stringify(value);
  return json.length > 60 ? `${json.slice(0, 57)}...` : json;
}

export function describeAuditDetails(
  previousValue: unknown,
  newValue: unknown,
): string {
  if (!newValue || typeof newValue !== "object") return "";

  const next = newValue as Record<string, unknown>;
  const previous =
    previousValue && typeof previousValue === "object"
      ? (previousValue as Record<string, unknown>)
      : null;

  const parts = Object.entries(next).map(([key, value]) => {
    if (SENSITIVE_KEY.test(key)) return `${key}: hidden`;
    if (previous && key in previous) {
      return `${key}: ${formatAuditValue(previous[key])} → ${formatAuditValue(value)}`;
    }
    return `${key}: ${formatAuditValue(value)}`;
  });

  const text = parts.join("; ");
  return text.length > 220 ? `${text.slice(0, 217)}...` : text;
}

export async function getAuditStats() {
  const [row] = await db
    .select({ total: count(), oldest: min(auditLogs.createdAt) })
    .from(auditLogs);

  return { total: row?.total ?? 0, oldest: row?.oldest ?? null };
}

export async function getRecentActivity(
  target: { organizationId: string } | { userId: string },
  limit = 10,
) {
  const condition =
    "organizationId" in target
      ? eq(auditLogs.organizationId, target.organizationId)
      : or(
          eq(auditLogs.userId, target.userId),
          eq(auditLogs.recordId, target.userId),
        );

  const rows = await db
    .select({
      id: auditLogs.id,
      action: auditLogs.action,
      previousValue: auditLogs.previousValue,
      newValue: auditLogs.newValue,
      createdAt: auditLogs.createdAt,
      actorName: users.name,
    })
    .from(auditLogs)
    .leftJoin(users, eq(auditLogs.userId, users.id))
    .where(condition)
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    label: describeAuditAction(row.action),
    details: describeAuditDetails(row.previousValue, row.newValue),
    actorName: row.actorName ?? "System",
    createdAt: row.createdAt.toISOString(),
  }));
}

export type RecentActivityItem = Awaited<
  ReturnType<typeof getRecentActivity>
>[number];
