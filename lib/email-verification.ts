import { createHash, randomBytes } from "crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { emailVerificationTokens, users } from "@/db/schema";
import { sendEmail } from "@/lib/email";
import { SITE_URL } from "@/lib/site";

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function issueVerificationToken(userId: string) {
  await db
    .update(emailVerificationTokens)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(emailVerificationTokens.userId, userId),
        isNull(emailVerificationTokens.usedAt),
      ),
    );

  const token = randomBytes(32).toString("base64url");

  await db.insert(emailVerificationTokens).values({
    userId,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
  });

  return token;
}

export async function isVerificationTokenValid(token: string) {
  if (!token) return false;

  const [row] = await db
    .select({ id: emailVerificationTokens.id })
    .from(emailVerificationTokens)
    .where(
      and(
        eq(emailVerificationTokens.tokenHash, hashToken(token)),
        isNull(emailVerificationTokens.usedAt),
        gt(emailVerificationTokens.expiresAt, new Date()),
      ),
    )
    .limit(1);

  return Boolean(row);
}

export async function consumeVerificationToken(token: string) {
  const [claimed] = await db
    .update(emailVerificationTokens)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(emailVerificationTokens.tokenHash, hashToken(token)),
        isNull(emailVerificationTokens.usedAt),
        gt(emailVerificationTokens.expiresAt, new Date()),
      ),
    )
    .returning({ userId: emailVerificationTokens.userId });

  if (!claimed) {
    return {
      ok: false as const,
      error: "This confirmation link is invalid or has expired.",
    };
  }

  await db
    .update(users)
    .set({ emailVerifiedAt: new Date() })
    .where(and(eq(users.id, claimed.userId), isNull(users.emailVerifiedAt)));

  return { ok: true as const, userId: claimed.userId };
}

export async function sendVerificationEmail(userId: string, email: string) {
  const token = await issueVerificationToken(userId);
  const link = `${SITE_URL}/verify-email/confirm?token=${token}`;

  return sendEmail({
    to: email,
    subject: "Confirm your email for Aimify",
    text: `Welcome to Aimify.\n\nConfirm your email address to finish setting up your account:\n${link}\n\nThe link works for 24 hours. If you didn't create an Aimify account, you can ignore this email.`,
    html: `<p>Welcome to Aimify.</p><p><a href="${link}">Confirm your email address</a> to finish setting up your account. The link works for 24 hours.</p><p>If you didn't create an Aimify account, you can ignore this email.</p>`,
  });
}

export async function redirectIfEmailUnverified(userId: string) {
  const [user] = await db
    .select({ emailVerifiedAt: users.emailVerifiedAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user?.emailVerifiedAt) {
    redirect("/verify-email");
  }
}

export async function isEmailVerified(userId: string) {
  const [user] = await db
    .select({ emailVerifiedAt: users.emailVerifiedAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return Boolean(user?.emailVerifiedAt);
}
