import { NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { logAudit } from "@/lib/audit";
import { revokeSession } from "@/lib/sessions";

export async function POST(request: Request) {
  const session = await getApiSession(request);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (session.sessionId) {
    await revokeSession(session.userId, session.sessionId);
  }

  await logAudit({
    userId: session.userId,
    module: "api",
    action: "user.signed_out",
    recordId: session.userId,
    newValue: { client: "api" },
  });

  return NextResponse.json({ success: true });
}
