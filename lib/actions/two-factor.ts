"use server";

import { compare } from "bcryptjs";
import { eq } from "drizzle-orm";
import QRCode from "qrcode";
import { after } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { logAudit } from "@/lib/audit";
import { sendEmail } from "@/lib/email";
import { isRateLimited, recordLoginAttempt } from "@/lib/rate-limit";
import { revokeAllSessions } from "@/lib/sessions";
import { otpauthUri } from "@/lib/totp";
import {
  beginSetup,
  confirmSetup,
  disableTwoFactor,
  getPendingSecret,
  getTwoFactorState,
  replaceBackupCodes,
  verifyLoginCode,
} from "@/lib/two-factor";

async function currentUser() {
  const session = await auth();

  if (!session?.user?.id) return null;

  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      passwordHash: users.passwordHash,
    })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  return user
    ? { ...user, sessionId: session.user.sessionId ?? null }
    : null;
}

function notify(email: string, enabled: boolean) {
  after(() =>
    sendEmail({
      to: email,
      subject: enabled
        ? "Two-factor authentication is now on for your Aimify account"
        : "Two-factor authentication was turned off on your Aimify account",
      text: enabled
        ? "Two-factor authentication was turned on for your Aimify account. From now on you'll need a code from your authenticator app to sign in.\n\nIf this wasn't you, change your password and contact support@aimify.app right away."
        : "Two-factor authentication was turned off for your Aimify account.\n\nIf this wasn't you, change your password and contact support@aimify.app right away.",
    }),
  );
}

export async function getTwoFactorStatusAction() {
  const user = await currentUser();

  if (!user) return { error: "You need to sign in first." };

  return { status: await getTwoFactorState(user.id) };
}

export async function startTwoFactorSetupAction() {
  const user = await currentUser();

  if (!user) return { error: "You need to sign in first." };

  const state = await getTwoFactorState(user.id);

  if (state.enabled) return { error: "Two-factor is already on." };

  const secret = await beginSetup(user.id);
  const qr = await QRCode.toDataURL(otpauthUri(secret, user.email), {
    margin: 1,
    width: 220,
  });

  return { secret, qr };
}

export async function confirmTwoFactorSetupAction(code: string) {
  const user = await currentUser();

  if (!user) return { error: "You need to sign in first." };

  const identifiers = [`2fa:${user.id}`];

  if (await isRateLimited(identifiers)) {
    return { error: "Too many wrong codes. Try again in a few minutes." };
  }

  if (!(await getPendingSecret(user.id))) {
    return { error: "Start the setup again." };
  }

  const result = await confirmSetup(user.id, String(code ?? ""));

  if (!result.ok) {
    await recordLoginAttempt(identifiers, false);
    return { error: result.error };
  }

  await revokeAllSessions(user.id, { exceptSessionId: user.sessionId });

  await logAudit({
    userId: user.id,
    module: "auth",
    action: "user.two_factor_enabled",
    recordId: user.id,
  });

  notify(user.email, true);

  return { success: true, backupCodes: result.backupCodes };
}

export async function disableTwoFactorAction(password: string, code: string) {
  const user = await currentUser();

  if (!user) return { error: "You need to sign in first." };

  const identifiers = [`2fa:${user.id}`];

  if (await isRateLimited(identifiers)) {
    return { error: "Too many wrong attempts. Try again in a few minutes." };
  }

  if (!(await getTwoFactorState(user.id)).enabled) {
    return { error: "Two-factor isn't on." };
  }

  if (!password || !(await compare(String(password), user.passwordHash))) {
    await recordLoginAttempt(identifiers, false);
    return { error: "That password isn't right." };
  }

  const verified = await verifyLoginCode(user.id, String(code ?? ""));

  if (!verified.ok) {
    await recordLoginAttempt(identifiers, false);
    return {
      error:
        "That code isn't right, or it was already used. Wait for the next code and try again.",
    };
  }

  await disableTwoFactor(user.id);
  await revokeAllSessions(user.id, { exceptSessionId: user.sessionId });

  await logAudit({
    userId: user.id,
    module: "auth",
    action: "user.two_factor_disabled",
    recordId: user.id,
  });

  notify(user.email, false);

  return { success: true };
}

export async function regenerateBackupCodesAction(code: string) {
  const user = await currentUser();

  if (!user) return { error: "You need to sign in first." };

  const identifiers = [`2fa:${user.id}`];

  if (await isRateLimited(identifiers)) {
    return { error: "Too many wrong codes. Try again in a few minutes." };
  }

  if (!(await getTwoFactorState(user.id)).enabled) {
    return { error: "Two-factor isn't on." };
  }

  const verified = await verifyLoginCode(user.id, String(code ?? ""));

  if (!verified.ok) {
    await recordLoginAttempt(identifiers, false);
    return {
      error:
        "That code isn't right, or it was already used. Wait for the next code and try again.",
    };
  }

  const backupCodes = await replaceBackupCodes(user.id);

  await logAudit({
    userId: user.id,
    module: "auth",
    action: "user.backup_codes_regenerated",
    recordId: user.id,
  });

  return { success: true, backupCodes };
}
