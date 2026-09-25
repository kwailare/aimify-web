"use server";

import { headers } from "next/headers";
import { after } from "next/server";
import { eq } from "drizzle-orm";
import { hash } from "bcryptjs";
import { AuthError } from "next-auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { signIn } from "@/auth";
import { logAudit } from "@/lib/audit";
import { sendEmail } from "@/lib/email";
import { consumeResetToken, issueResetToken } from "@/lib/password-reset";
import { validateNewPassword } from "@/lib/password-rules";
import { SITE_URL } from "@/lib/site";
import { getClientIp, isRateLimited, recordLoginAttempt } from "@/lib/rate-limit";

export async function signUpAction(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!name || !email || !password) {
    return { error: "All fields are required." };
  }

  const passwordError = validateNewPassword(password);

  if (passwordError) {
    return { error: passwordError };
  }

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existing) {
    return { error: "An account with this email already exists." };
  }

  const passwordHash = await hash(password, 10);

  const [newUser] = await db
    .insert(users)
    .values({ name, email, passwordHash })
    .returning();

  await logAudit({
    userId: newUser.id,
    module: "auth",
    action: "user.signed_up",
    recordId: newUser.id,
    newValue: { name, email },
  });

  try {
    await signIn("credentials", { email, password, redirect: false });
  } catch (error) {
    if (error instanceof AuthError) {
      return {
        error: "Account created, but sign-in failed. Try signing in manually.",
      };
    }
    throw error;
  }

  return { success: true };
}

export async function requestPasswordResetAction(formData: FormData) {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();

  if (!email) {
    return { error: "Enter your email address." };
  }

  const ip = getClientIp(await headers());
  const identifiers = [`reset-ip:${ip}`, `reset-email:${email}`];

  if (await isRateLimited(identifiers)) {
    return {
      error: "Too many requests. Please try again in a few minutes.",
    };
  }

  await recordLoginAttempt(identifiers, false);

  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (user) {
    after(async () => {
      const token = await issueResetToken(user.id);
      const link = `${SITE_URL}/reset-password?token=${token}`;

      await sendEmail({
        to: email,
        subject: "Reset your Aimify password",
        text: `Someone asked to reset the password for your Aimify account.

Use this link within 1 hour to choose a new password:
${link}

If you didn't ask for this, you can ignore this email. Your password won't change.`,
        html: `<p>Someone asked to reset the password for your Aimify account.</p><p><a href="${link}">Choose a new password</a> (the link works for 1 hour).</p><p>If you didn't ask for this, you can ignore this email. Your password won't change.</p>`,
      });

      await logAudit({
        userId: user.id,
        module: "auth",
        action: "auth.password_reset_requested",
        recordId: user.id,
      });
    });
  }

  return { success: true };
}

export async function resetPasswordAction(token: string, formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");

  if (password !== confirm) {
    return { error: "The two passwords don't match." };
  }

  const result = await consumeResetToken(token, password);

  if (!result.ok) {
    return { error: result.error };
  }

  await logAudit({
    userId: result.userId,
    module: "auth",
    action: "user.password_reset_completed",
    recordId: result.userId,
  });

  return { success: true };
}

export async function signInAction(formData: FormData) {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  const ip = getClientIp(await headers());
  const identifiers = [`ip:${ip}`, `email:${email}`];

  if (await isRateLimited(identifiers)) {
    return {
      error: "Too many failed attempts. Please try again in a few minutes.",
    };
  }

  try {
    await signIn("credentials", { email, password, redirect: false });
  } catch (error) {
    if (error instanceof AuthError) {
      await recordLoginAttempt(identifiers, false);
      return { error: "Invalid email or password." };
    }
    throw error;
  }

  await recordLoginAttempt(identifiers, true);

  const [signedInUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (signedInUser) {
    await logAudit({
      userId: signedInUser.id,
      module: "auth",
      action: "user.signed_in",
      recordId: signedInUser.id,
    });
  }

  return { success: true };
}
