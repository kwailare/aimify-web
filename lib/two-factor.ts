import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "crypto";
import { and, eq, isNull, lt, or } from "drizzle-orm";
import { db } from "@/db";
import { twoFactorBackupCodes, users } from "@/db/schema";
import { generateTotpSecret, verifyTotp } from "@/lib/totp";

const BACKUP_CODE_COUNT = 10;
const BACKUP_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

function encryptionKey() {
  if (!process.env.AUTH_SECRET) {
    throw new Error("AUTH_SECRET is not set.");
  }

  return createHash("sha256")
    .update(`${process.env.AUTH_SECRET}:two-factor`)
    .digest();
}

export function encryptSecret(secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);

  return [iv, cipher.getAuthTag(), encrypted]
    .map((part) => part.toString("base64"))
    .join(".");
}

export function decryptSecret(stored: string) {
  const [iv, tag, encrypted] = stored
    .split(".")
    .map((part) => Buffer.from(part, "base64"));
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  decipher.setAuthTag(tag);

  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString(
    "utf8",
  );
}

function hashBackupCode(code: string) {
  return createHash("sha256").update(normalizeBackupCode(code)).digest("hex");
}

export function normalizeBackupCode(code: string) {
  return code.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function generateBackupCode() {
  const bytes = randomBytes(8);
  let code = "";

  for (let i = 0; i < 8; i++) {
    code += BACKUP_ALPHABET[bytes[i] % BACKUP_ALPHABET.length];
  }

  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

export async function getTwoFactorState(userId: string) {
  const [row] = await db
    .select({
      secret: users.twoFactorSecret,
      enabledAt: users.twoFactorEnabledAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const remaining = row?.enabledAt
    ? await db
        .select({ id: twoFactorBackupCodes.id })
        .from(twoFactorBackupCodes)
        .where(
          and(
            eq(twoFactorBackupCodes.userId, userId),
            isNull(twoFactorBackupCodes.usedAt),
          ),
        )
    : [];

  return {
    enabled: Boolean(row?.enabledAt),
    pending: Boolean(row?.secret && !row.enabledAt),
    enabledAt: row?.enabledAt ?? null,
    backupCodesRemaining: remaining.length,
  };
}

export async function isTwoFactorEnabled(userId: string) {
  const [row] = await db
    .select({ enabledAt: users.twoFactorEnabledAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return Boolean(row?.enabledAt);
}

export async function beginSetup(userId: string) {
  const secret = generateTotpSecret();

  await db
    .update(users)
    .set({
      twoFactorSecret: encryptSecret(secret),
      twoFactorEnabledAt: null,
      twoFactorLastStep: null,
    })
    .where(and(eq(users.id, userId), isNull(users.twoFactorEnabledAt)));

  return secret;
}

export async function getPendingSecret(userId: string) {
  const [row] = await db
    .select({
      secret: users.twoFactorSecret,
      enabledAt: users.twoFactorEnabledAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!row?.secret || row.enabledAt) return null;

  return decryptSecret(row.secret);
}

export async function replaceBackupCodes(userId: string) {
  await db
    .delete(twoFactorBackupCodes)
    .where(eq(twoFactorBackupCodes.userId, userId));

  const codes = Array.from({ length: BACKUP_CODE_COUNT }, generateBackupCode);

  await db.insert(twoFactorBackupCodes).values(
    codes.map((code) => ({ userId, codeHash: hashBackupCode(code) })),
  );

  return codes;
}

export async function confirmSetup(userId: string, code: string) {
  const [row] = await db
    .select({
      secret: users.twoFactorSecret,
      enabledAt: users.twoFactorEnabledAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!row?.secret || row.enabledAt) {
    return { ok: false as const, error: "Start the setup again." };
  }

  const step = verifyTotp(decryptSecret(row.secret), code);

  if (step === null) {
    return { ok: false as const, error: "That code isn't right. Check the time on your phone and try the newest code." };
  }

  const [enabled] = await db
    .update(users)
    .set({ twoFactorEnabledAt: new Date(), twoFactorLastStep: step })
    .where(and(eq(users.id, userId), isNull(users.twoFactorEnabledAt)))
    .returning({ id: users.id });

  if (!enabled) {
    return { ok: false as const, error: "Two-factor is already on." };
  }

  const backupCodes = await replaceBackupCodes(userId);

  return { ok: true as const, backupCodes };
}

export async function verifyLoginCode(userId: string, input: string) {
  const [row] = await db
    .select({
      secret: users.twoFactorSecret,
      enabledAt: users.twoFactorEnabledAt,
      lastStep: users.twoFactorLastStep,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!row?.secret || !row.enabledAt) {
    return { ok: true as const, method: "none" as const };
  }

  const trimmed = input.trim();

  if (!trimmed) return { ok: false as const };

  if (/^\d[\d\s]*$/.test(trimmed)) {
    const step = verifyTotp(decryptSecret(row.secret), trimmed, {
      notBeforeStep: row.lastStep,
    });

    if (step === null) return { ok: false as const };

    const [claimed] = await db
      .update(users)
      .set({ twoFactorLastStep: step })
      .where(
        and(
          eq(users.id, userId),
          or(isNull(users.twoFactorLastStep), lt(users.twoFactorLastStep, step)),
        ),
      )
      .returning({ id: users.id });

    return claimed
      ? { ok: true as const, method: "totp" as const }
      : { ok: false as const };
  }

  const normalized = normalizeBackupCode(trimmed);

  if (normalized.length !== 8) return { ok: false as const };

  const [used] = await db
    .update(twoFactorBackupCodes)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(twoFactorBackupCodes.userId, userId),
        eq(twoFactorBackupCodes.codeHash, hashBackupCode(normalized)),
        isNull(twoFactorBackupCodes.usedAt),
      ),
    )
    .returning({ id: twoFactorBackupCodes.id });

  return used
    ? { ok: true as const, method: "backup" as const }
    : { ok: false as const };
}

export async function disableTwoFactor(userId: string) {
  await db
    .update(users)
    .set({
      twoFactorSecret: null,
      twoFactorEnabledAt: null,
      twoFactorLastStep: null,
    })
    .where(eq(users.id, userId));

  await db
    .delete(twoFactorBackupCodes)
    .where(eq(twoFactorBackupCodes.userId, userId));
}
