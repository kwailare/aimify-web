import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { runWhatsAppReminders } from "@/lib/whatsapp/notify";

export const dynamic = "force-dynamic";

// Daily: WhatsApp reminders of overdue amounts, for businesses that send
// them, to customers who agreed (see runWhatsAppReminders). Kept apart from
// the subscription job so either can run on its own.

function isAuthorized(request: Request, secret: string) {
  const a = Buffer.from(request.headers.get("authorization") ?? "");
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured." }, { status: 503 });
  }
  if (!isAuthorized(request, secret)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  return NextResponse.json({ ok: true, reminders: await runWhatsAppReminders() });
}
