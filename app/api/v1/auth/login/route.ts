import { NextResponse } from "next/server";
import { verifyCredentials } from "@/lib/credentials";
import { createApiToken } from "@/lib/api-auth";
import { createSession, metaFromHeaders } from "@/lib/sessions";
import { isTwoFactorEnabled, verifyLoginCode } from "@/lib/two-factor";
import { logAudit } from "@/lib/audit";
import { getClientIp, isRateLimited, recordLoginAttempt } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  const email = typeof body?.email === "string" ? body.email : null;
  const password = typeof body?.password === "string" ? body.password : null;

  if (!email || !password) {
    return NextResponse.json(
      { error: "Email and password are required." },
      { status: 400 },
    );
  }

  const ip = getClientIp(request.headers);
  const identifiers = [`ip:${ip}`, `email:${email.toLowerCase()}`];

  if (await isRateLimited(identifiers)) {
    return NextResponse.json(
      { error: "Too many failed attempts. Please try again in a few minutes." },
      { status: 429 },
    );
  }

  const user = await verifyCredentials(email, password);

  if (!user) {
    await recordLoginAttempt(identifiers, false);
    return NextResponse.json(
      { error: "Invalid email or password." },
      { status: 401 },
    );
  }

  if (await isTwoFactorEnabled(user.id)) {
    const code = typeof body?.code === "string" ? body.code : "";

    if (!code.trim()) {
      return NextResponse.json(
        {
          error: "Enter the code from your authenticator app.",
          code: "two_factor_required",
        },
        { status: 401 },
      );
    }

    if (!(await verifyLoginCode(user.id, code)).ok) {
      await recordLoginAttempt(identifiers, false);
      return NextResponse.json(
        {
          error: "That code isn't right, or it was already used.",
          code: "invalid_two_factor_code",
        },
        { status: 401 },
      );
    }
  }

  await recordLoginAttempt(identifiers, true);

  const deviceName =
    typeof body?.deviceName === "string" ? body.deviceName : null;
  const session = await createSession({
    userId: user.id,
    kind: "desktop",
    meta: metaFromHeaders(request.headers),
    deviceName,
  });
  const token = await createApiToken(user.id, session.id);

  await logAudit({
    userId: user.id,
    module: "api",
    action: "user.signed_in",
    recordId: user.id,
    newValue: { client: "api" },
  });

  return NextResponse.json({ token, expiresAt: session.expiresAt });
}
