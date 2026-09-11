import { SignJWT, jwtVerify } from "jose";

function getSecretKey() {
  if (!process.env.AUTH_SECRET) {
    throw new Error("AUTH_SECRET is not set.");
  }
  return new TextEncoder().encode(process.env.AUTH_SECRET);
}

export async function createApiToken(userId: string) {
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(getSecretKey());
}

export async function verifyApiToken(request: Request): Promise<string | null> {
  const authHeader = request.headers.get("authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.slice("Bearer ".length);

  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}
