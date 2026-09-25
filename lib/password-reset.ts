import { createHash, randomBytes } from "crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { hash } from "bcryptjs";
import { db } from "@/db";
import { passwordResetTokens, users } from "@/db/schema";
import { validateNewPassword } from "@/lib/password-rules";

const TOKEN_TTL_MS = 60 * 60 * 1000;

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function issueResetToken(userId: string) {
  await db
    .update(passwordResetTokens)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(passwordResetTokens.userId, userId),
        isNull(passwordResetTokens.usedAt),
      ),
    );

  const token = randomBytes(32).toString("base64url");

  await db.insert(passwordResetTokens).values({
    userId,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
  });

  return token;
}

export async function isResetTokenValid(token: string) {
  if (!token) return false;

  const [row] = await db
    .select({ id: passwordResetTokens.id })
    .from(passwordResetTokens)
    .where(
      and(
        eq(passwordResetTokens.tokenHash, hashToken(token)),
        isNull(passwordResetTokens.usedAt),
        gt(passwordResetTokens.expiresAt, new Date()),
      ),
    )
    .limit(1);

  return Boolean(row);
}

export async function consumeResetToken(token: string, newPassword: string) {
  const passwordError = validateNewPassword(newPassword);

  if (passwordError) {
    return { ok: false as const, error: passwordError };
  }

  const [claimed] = await db
    .update(passwordResetTokens)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(passwordResetTokens.tokenHash, hashToken(token)),
        isNull(passwordResetTokens.usedAt),
        gt(passwordResetTokens.expiresAt, new Date()),
      ),
    )
    .returning({ userId: passwordResetTokens.userId });

  if (!claimed) {
    return {
      ok: false as const,
      error: "This reset link is invalid or has expired. Request a new one.",
    };
  }

  await db
    .update(users)
    .set({ passwordHash: await hash(newPassword, 10) })
    .where(eq(users.id, claimed.userId));

  return { ok: true as const, userId: claimed.userId };
}
