"use server";

import { randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import { hash } from "bcryptjs";
import { db } from "@/db";
import { organizations, users } from "@/db/schema";
import { getAdminContext } from "@/lib/admin";
import { logAudit } from "@/lib/audit";

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
    .select({ subscriptionStatus: organizations.subscriptionStatus })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);

  if (!before) {
    return { error: "Organization not found." };
  }

  const nextStatus = "trial";

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

  // Deliberately never store or log the plaintext password -- only that a
  // reset happened, by whom, for whom, and which method was used.
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

  // Only hand the password back to the client when it was generated --
  // a manually-entered password is already known to whoever typed it.
  return isManual
    ? { success: true as const }
    : { success: true as const, temporaryPassword: passwordToSet };
}
