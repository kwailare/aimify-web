"use server";

import { compare, hash } from "bcryptjs";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { logAudit } from "@/lib/audit";
import { revokeAllSessions } from "@/lib/sessions";
import { validateNewPassword } from "@/lib/password-rules";
import { isRateLimited, recordLoginAttempt } from "@/lib/rate-limit";

const PHONE_PATTERN = /^[+\d][\d\s()-]{6,19}$/;

export async function updateProfileAction(formData: FormData) {
  const session = await auth();

  if (!session?.user?.id) {
    return { error: "You need to sign in first." };
  }

  const name = String(formData.get("name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();

  if (!name || !phone) {
    return { error: "Full name and phone number are required." };
  }

  if (name.length > 120) {
    return { error: "Name is too long." };
  }

  if (!PHONE_PATTERN.test(phone)) {
    return { error: "Enter a valid phone number." };
  }

  const [before] = await db
    .select({ name: users.name, phone: users.phone })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  await db
    .update(users)
    .set({ name, phone })
    .where(eq(users.id, session.user.id));

  await logAudit({
    userId: session.user.id,
    module: "profile",
    action: "profile.updated",
    recordId: session.user.id,
    previousValue: before,
    newValue: { name, phone },
  });

  return { success: true };
}

export async function changePasswordAction(formData: FormData) {
  const session = await auth();

  if (!session?.user?.id) {
    return { error: "You need to sign in first." };
  }

  const userId = session.user.id;
  const currentPassword = String(formData.get("currentPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");

  if (!currentPassword || !newPassword) {
    return { error: "Enter your current and new password." };
  }

  const passwordError = validateNewPassword(newPassword);

  if (passwordError) {
    return { error: passwordError };
  }

  if (newPassword === currentPassword) {
    return { error: "New password must be different from the current one." };
  }

  const identifiers = [`pwchange:${userId}`];

  if (await isRateLimited(identifiers)) {
    return {
      error: "Too many failed attempts. Please try again in a few minutes.",
    };
  }

  const [user] = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    return { error: "Account not found." };
  }

  if (!(await compare(currentPassword, user.passwordHash))) {
    await recordLoginAttempt(identifiers, false);
    return { error: "Current password is incorrect." };
  }

  await db
    .update(users)
    .set({ passwordHash: await hash(newPassword, 10) })
    .where(eq(users.id, userId));

  const signedOut = await revokeAllSessions(userId, {
    exceptSessionId: session.user.sessionId,
  });

  await logAudit({
    userId,
    module: "auth",
    action: "user.password_changed",
    recordId: userId,
    newValue: { otherDevicesSignedOut: signedOut },
  });

  return { success: true };
}
