import { SignJWT, jwtVerify } from "jose";
import { isLegacyTokenRevoked, isSessionActive } from "@/lib/sessions";

function getSecretKey() {
  if (!process.env.AUTH_SECRET) {
    throw new Error("AUTH_SECRET is not set.");
  }
  return new TextEncoder().encode(process.env.AUTH_SECRET);
}

export async function createApiToken(userId: string, sessionId: string) {
  return new SignJWT({ sub: userId, sid: sessionId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(getSecretKey());
}

export async function getApiSession(
  request: Request,
): Promise<{ userId: string; sessionId: string | null } | null> {
  const authHeader = request.headers.get("authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.slice("Bearer ".length);

  try {
    const { payload } = await jwtVerify(token, getSecretKey());

    if (typeof payload.sub !== "string") {
      return null;
    }

    const sessionId = typeof payload.sid === "string" ? payload.sid : null;

    const active = sessionId
      ? await isSessionActive(sessionId, payload.sub)
      : !(await isLegacyTokenRevoked(payload.sub, payload.iat));

    return active ? { userId: payload.sub, sessionId } : null;
  } catch {
    return null;
  }
}

export async function verifyApiToken(request: Request): Promise<string | null> {
  const session = await getApiSession(request);

  return session ? session.userId : null;
}
