import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { whatsappMessages } from "@/db/schema";
import { isValidMetaSignature, readMetaStatuses } from "@/lib/whatsapp/meta";

export const dynamic = "force-dynamic";

// WhatsApp (Meta) webhook: GET is Meta's one-time check when the webhook is
// set up; POST carries delivery updates (sent, delivered, read, failed) for
// the messages Aimify sent, which update the message log.

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN?.trim();
  if (verifyToken && params.get("hub.mode") === "subscribe" && params.get("hub.verify_token") === verifyToken) {
    return new Response(params.get("hub.challenge") ?? "", { status: 200 });
  }
  return NextResponse.json({ error: "Verification failed." }, { status: 403 });
}

// The order statuses only move forward in (a late "sent" never undoes "read").
const RANK: Record<string, number> = { sending: 0, sent: 1, delivered: 2, read: 3, failed: 4 };

export async function POST(request: Request) {
  const rawBody = await request.text();
  if (!isValidMetaSignature(rawBody, request.headers.get("x-hub-signature-256"))) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }
  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Malformed body." }, { status: 400 });
  }
  let updated = 0;
  for (const update of readMetaStatuses(body)) {
    const [message] = await db
      .select({ id: whatsappMessages.id, status: whatsappMessages.status })
      .from(whatsappMessages)
      .where(eq(whatsappMessages.providerMessageId, update.messageId))
      .limit(1);
    if (!message || (RANK[update.status] ?? 0) <= (RANK[message.status] ?? 0)) continue;
    await db
      .update(whatsappMessages)
      .set({ status: update.status, error: update.error, updatedAt: new Date() })
      .where(eq(whatsappMessages.id, message.id));
    updated += 1;
  }
  return NextResponse.json({ received: true, updated });
}
