import { NextResponse } from "next/server";
import { verifyCredentials } from "@/lib/credentials";
import { createApiToken } from "@/lib/api-auth";
import { logAudit } from "@/lib/audit";

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

  const user = await verifyCredentials(email, password);

  if (!user) {
    return NextResponse.json(
      { error: "Invalid email or password." },
      { status: 401 },
    );
  }

  const token = await createApiToken(user.id);

  await logAudit({
    userId: user.id,
    module: "api",
    action: "user.signed_in",
    recordId: user.id,
    newValue: { client: "api" },
  });

  return NextResponse.json({ token });
}
