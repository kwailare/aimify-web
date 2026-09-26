import { and, desc, eq, gt, isNull, lt, ne, or } from "drizzle-orm";
import { db } from "@/db";
import { userSessions, users } from "@/db/schema";
import { getClientIp } from "@/lib/rate-limit";

export type SessionKind = "web" | "desktop";

export const WEB_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const DESKTOP_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const CACHE_TTL_MS = 20 * 1000;
const TOUCH_INTERVAL_MS = 5 * 60 * 1000;
const activeCache = new Map<string, { ok: boolean; at: number }>();
const legacyCache = new Map<string, { validAfter: number | null; at: number }>();

export type RequestMeta = { ip: string | null; userAgent: string | null };

export function metaFromHeaders(headers: {
  get(name: string): string | null;
}): RequestMeta {
  const ip = getClientIp(headers);
  const userAgent = headers.get("user-agent");

  return {
    ip: ip && ip !== "unknown" ? ip.slice(0, 64) : null,
    userAgent: userAgent ? userAgent.slice(0, 300) : null,
  };
}

export async function getRequestMeta(): Promise<RequestMeta> {
  try {
    const { headers } = await import("next/headers");
    return metaFromHeaders(await headers());
  } catch {
    return { ip: null, userAgent: null };
  }
}

export function describeDevice(userAgent: string | null, deviceName?: string | null) {
  if (deviceName) return deviceName;
  if (!userAgent) return "Unknown device";

  const ua = userAgent;
  const os = /Windows/i.test(ua)
    ? "Windows"
    : /Android/i.test(ua)
      ? "Android"
      : /iPhone|iPad|iOS/i.test(ua)
        ? "iOS"
        : /Mac OS X|Macintosh/i.test(ua)
          ? "macOS"
          : /Linux/i.test(ua)
            ? "Linux"
            : null;
  const browser = /Edg\//i.test(ua)
    ? "Edge"
    : /OPR\/|Opera/i.test(ua)
      ? "Opera"
      : /Chrome\//i.test(ua)
        ? "Chrome"
        : /Firefox\//i.test(ua)
          ? "Firefox"
          : /Safari\//i.test(ua)
            ? "Safari"
            : null;

  if (browser && os) return `${browser} on ${os}`;
  if (browser) return browser;
  if (os) return os;

  return ua.slice(0, 60);
}

export async function createSession(entry: {
  userId: string;
  kind: SessionKind;
  meta?: RequestMeta;
  deviceName?: string | null;
}) {
  const meta = entry.meta ?? (await getRequestMeta());
  const ttl =
    entry.kind === "web" ? WEB_SESSION_TTL_MS : DESKTOP_SESSION_TTL_MS;

  const [created] = await db
    .insert(userSessions)
    .values({
      userId: entry.userId,
      kind: entry.kind,
      ip: meta.ip,
      userAgent: meta.userAgent,
      deviceName: entry.deviceName?.trim().slice(0, 80) || null,
      expiresAt: new Date(Date.now() + ttl),
    })
    .returning({ id: userSessions.id, expiresAt: userSessions.expiresAt });

  return created;
}

export async function isSessionActive(sessionId: string, userId: string) {
  const cached = activeCache.get(sessionId);

  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.ok;
  }

  const [row] = await db
    .select({ id: userSessions.id, lastSeenAt: userSessions.lastSeenAt })
    .from(userSessions)
    .where(
      and(
        eq(userSessions.id, sessionId),
        eq(userSessions.userId, userId),
        isNull(userSessions.revokedAt),
        gt(userSessions.expiresAt, new Date()),
      ),
    )
    .limit(1);

  activeCache.set(sessionId, { ok: Boolean(row), at: Date.now() });

  if (row && Date.now() - row.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
    await db
      .update(userSessions)
      .set({ lastSeenAt: new Date() })
      .where(eq(userSessions.id, sessionId));
  }

  return Boolean(row);
}

export async function isLegacyTokenRevoked(userId: string, issuedAtSeconds: number | undefined) {
  const cached = legacyCache.get(userId);
  let validAfter: number | null;

  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    validAfter = cached.validAfter;
  } else {
    const [row] = await db
      .select({ validAfter: users.sessionsValidAfter })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!row) return true;

    validAfter = row.validAfter ? row.validAfter.getTime() : null;
    legacyCache.set(userId, { validAfter, at: Date.now() });
  }

  if (validAfter === null) return false;
  if (issuedAtSeconds === undefined) return true;

  return issuedAtSeconds * 1000 < validAfter;
}

export async function revokeSession(userId: string, sessionId: string) {
  const [revoked] = await db
    .update(userSessions)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(userSessions.id, sessionId),
        eq(userSessions.userId, userId),
        isNull(userSessions.revokedAt),
      ),
    )
    .returning({ id: userSessions.id });

  activeCache.delete(sessionId);

  return Boolean(revoked);
}

export async function revokeAllSessions(
  userId: string,
  options: { exceptSessionId?: string | null } = {},
) {
  const conditions = [
    eq(userSessions.userId, userId),
    isNull(userSessions.revokedAt),
  ];

  if (options.exceptSessionId) {
    conditions.push(ne(userSessions.id, options.exceptSessionId));
  }

  const revoked = await db
    .update(userSessions)
    .set({ revokedAt: new Date() })
    .where(and(...conditions))
    .returning({ id: userSessions.id });

  await db
    .update(users)
    .set({ sessionsValidAfter: new Date() })
    .where(eq(users.id, userId));

  for (const row of revoked) activeCache.delete(row.id);
  legacyCache.delete(userId);

  return revoked.length;
}

export async function listSessions(userId: string) {
  return db
    .select()
    .from(userSessions)
    .where(
      and(
        eq(userSessions.userId, userId),
        isNull(userSessions.revokedAt),
        gt(userSessions.expiresAt, new Date()),
      ),
    )
    .orderBy(desc(userSessions.lastSeenAt));
}

export async function pruneSessions() {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  await db
    .delete(userSessions)
    .where(
      or(lt(userSessions.expiresAt, cutoff), lt(userSessions.revokedAt, cutoff)),
    );
}
