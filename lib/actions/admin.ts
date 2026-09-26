"use server";

import { randomBytes } from "crypto";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { hash } from "bcryptjs";
import { db } from "@/db";
import { organizations, users } from "@/db/schema";
import { getAdminContext } from "@/lib/admin";
import { countAuditLogs, deleteAuditLogs } from "@/lib/activity-history";
import { clearCutoff, isClearRange } from "@/lib/activity-ranges";
import { getRecentActivity, logAudit } from "@/lib/audit";
import { sendVerificationEmail } from "@/lib/email-verification";

const TEMP_PASSWORD_ALPHABET =
  "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";

function generateTempPassword(length = 12) {
  const bytes = randomBytes(length);
  let password = "";
  for (let i = 0; i < length; i++) {
    password += TEMP_PASSWORD_ALPHABET[bytes[i] % TEMP_PASSWORD_ALPHABET.length];
  }
  return password;
}

export async function suspendOrganizationAction(organizationId: string) {
  const context = await getAdminContext();

  if (!context) {
    return { error: "Not authorized." };
  }

  const [before] = await db
    .select({ subscriptionStatus: organizations.subscriptionStatus })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);

  if (!before) {
    return { error: "Organization not found." };
  }

  await db
    .update(organizations)
    .set({ subscriptionStatus: "suspended" })
    .where(eq(organizations.id, organizationId));

  await logAudit({
    organizationId,
    userId: context.admin.id,
    module: "admin",
    action: "organization.suspended",
    recordId: organizationId,
    previousValue: before,
    newValue: { subscriptionStatus: "suspended" },
  });

  return { success: true };
}

export async function reactivateOrganizationAction(organizationId: string) {
  const context = await getAdminContext();

  if (!context) {
    return { error: "Not authorized." };
  }

  const [before] = await db
    .select({
      subscriptionStatus: organizations.subscriptionStatus,
      trialEndsAt: organizations.trialEndsAt,
    })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);

  if (!before) {
    return { error: "Organization not found." };
  }

  const nextStatus = !before.trialEndsAt
    ? "pending"
    : before.trialEndsAt > new Date()
      ? "trial"
      : "active";

  await db
    .update(organizations)
    .set({ subscriptionStatus: nextStatus })
    .where(eq(organizations.id, organizationId));

  await logAudit({
    organizationId,
    userId: context.admin.id,
    module: "admin",
    action: "organization.reactivated",
    recordId: organizationId,
    previousValue: before,
    newValue: { subscriptionStatus: nextStatus },
  });

  return { success: true };
}

export async function resetUserPasswordAction(
  userId: string,
  manualPassword?: string,
) {
  const context = await getAdminContext();

  if (!context) {
    return { error: "Not authorized." };
  }

  const [targetUser] = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!targetUser) {
    return { error: "User not found." };
  }

  const isManual = Boolean(manualPassword);

  if (isManual && manualPassword!.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }

  const passwordToSet = isManual ? manualPassword! : generateTempPassword();
  const passwordHash = await hash(passwordToSet, 10);

  await db.update(users).set({ passwordHash }).where(eq(users.id, userId));

  await logAudit({
    userId: context.admin.id,
    module: "admin",
    action: "user.password_reset",
    recordId: userId,
    newValue: {
      targetEmail: targetUser.email,
      method: isManual ? "manual" : "generated",
    },
  });

  return isManual
    ? { success: true as const }
    : { success: true as const, temporaryPassword: passwordToSet };
}

export async function verifyUserEmailAction(userId: string) {
  const context = await getAdminContext();

  if (!context) {
    return { error: "Not authorized." };
  }

  const [updated] = await db
    .update(users)
    .set({ emailVerifiedAt: new Date() })
    .where(and(eq(users.id, userId), isNull(users.emailVerifiedAt)))
    .returning({ id: users.id, email: users.email });

  if (!updated) {
    return { error: "That user doesn't exist or is already verified." };
  }

  await logAudit({
    userId: context.admin.id,
    module: "admin",
    action: "admin.email_verified",
    recordId: userId,
    newValue: { targetEmail: updated.email },
  });

  return { success: true };
}

const TRIAL_EXTENSION_DAYS = [7, 14, 30];
const ACTIVATABLE_STATUSES = ["pending", "trial", "expired", "cancelled", "past_due"];
const EXTENDABLE_STATUSES = ["trial", "expired"];

export async function extendTrialAction(organizationId: string, days: number) {
  const context = await getAdminContext();

  if (!context) {
    return { error: "Not authorized." };
  }

  if (!TRIAL_EXTENSION_DAYS.includes(days)) {
    return { error: "Choose 7, 14 or 30 days." };
  }

  const [before] = await db
    .select({
      subscriptionStatus: organizations.subscriptionStatus,
      trialEndsAt: organizations.trialEndsAt,
    })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);

  if (!before) {
    return { error: "Organization not found." };
  }

  if (!EXTENDABLE_STATUSES.includes(before.subscriptionStatus)) {
    return { error: "Only organizations on a trial or with an expired trial can be extended." };
  }

  const now = new Date();
  const base =
    before.trialEndsAt && before.trialEndsAt > now ? before.trialEndsAt : now;
  const trialEndsAt = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);

  const [updated] = await db
    .update(organizations)
    .set({ subscriptionStatus: "trial", trialEndsAt })
    .where(
      and(
        eq(organizations.id, organizationId),
        inArray(organizations.subscriptionStatus, EXTENDABLE_STATUSES),
      ),
    )
    .returning({ id: organizations.id });

  if (!updated) {
    return { error: "The organization changed while you were working. Refresh and try again." };
  }

  await logAudit({
    organizationId,
    userId: context.admin.id,
    module: "admin",
    action: "admin.trial_extended",
    recordId: organizationId,
    previousValue: before,
    newValue: { subscriptionStatus: "trial", trialEndsAt, days },
  });

  return { success: true };
}

export async function activateSubscriptionAction(organizationId: string) {
  const context = await getAdminContext();

  if (!context) {
    return { error: "Not authorized." };
  }

  const [before] = await db
    .select({ subscriptionStatus: organizations.subscriptionStatus })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);

  if (!before) {
    return { error: "Organization not found." };
  }

  if (before.subscriptionStatus === "suspended") {
    return { error: "Reactivate this suspended organization first." };
  }

  if (!ACTIVATABLE_STATUSES.includes(before.subscriptionStatus)) {
    return { error: "This organization is already active." };
  }

  const [updated] = await db
    .update(organizations)
    .set({ subscriptionStatus: "active" })
    .where(
      and(
        eq(organizations.id, organizationId),
        eq(organizations.subscriptionStatus, before.subscriptionStatus),
      ),
    )
    .returning({ id: organizations.id });

  if (!updated) {
    return { error: "The organization changed while you were working. Refresh and try again." };
  }

  await logAudit({
    organizationId,
    userId: context.admin.id,
    module: "admin",
    action: "admin.subscription_activated",
    recordId: organizationId,
    previousValue: before,
    newValue: { subscriptionStatus: "active", grantedManually: true },
  });

  return { success: true };
}

export async function sendUserVerificationEmailAction(userId: string) {
  const context = await getAdminContext();

  if (!context) {
    return { error: "Not authorized." };
  }

  const [target] = await db
    .select({
      id: users.id,
      email: users.email,
      emailVerifiedAt: users.emailVerifiedAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!target) {
    return { error: "User not found." };
  }

  if (target.emailVerifiedAt) {
    return { error: "This email is already verified." };
  }

  const sent = await sendVerificationEmail(target.id, target.email);

  if (!sent) {
    return { error: "The email couldn't be sent. Try again in a moment." };
  }

  await logAudit({
    userId: context.admin.id,
    module: "admin",
    action: "admin.verification_email_sent",
    recordId: userId,
    newValue: { targetEmail: target.email },
  });

  return { success: true };
}

export async function getRecentActivityAction(
  kind: "organization" | "user",
  id: string,
) {
  const context = await getAdminContext();

  if (!context) {
    return { error: "Not authorized." };
  }

  const items = await getRecentActivity(
    kind === "organization" ? { organizationId: id } : { userId: id },
  );

  return { items };
}

export async function countActivityToClearAction(range: string) {
  const context = await getAdminContext();

  if (!context) {
    return { error: "Not authorized." };
  }

  if (!isClearRange(range)) {
    return { error: "Choose a valid range." };
  }

  return { count: await countAuditLogs(clearCutoff(range)) };
}

export async function clearActivityHistoryAction(range: string) {
  const context = await getAdminContext();

  if (!context) {
    return { error: "Not authorized." };
  }

  if (!isClearRange(range)) {
    return { error: "Choose a valid range." };
  }

  const before = clearCutoff(range);
  const deleted = await deleteAuditLogs(before);

  await logAudit({
    userId: context.admin.id,
    module: "admin",
    action: "admin.activity_cleared",
    newValue: {
      range,
      deleted,
      olderThan: before ? before.toISOString() : "everything",
    },
  });

  return { success: true, deleted };
}
