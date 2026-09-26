import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { pruneSessions } from "@/lib/sessions";
import { runSubscriptionNotices } from "@/lib/subscription-notices";

export const dynamic = "force-dynamic";

function isAuthorized(request: Request, secret: string) {
  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);

  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured." },
      { status: 503 },
    );
  }

  if (!isAuthorized(request, secret)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const summary = await runSubscriptionNotices();

  await pruneSessions();

  return NextResponse.json({ ok: true, ...summary });
}
