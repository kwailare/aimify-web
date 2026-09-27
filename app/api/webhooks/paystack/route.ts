import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { paymentEvents, payments } from "@/db/schema";
import { logAudit } from "@/lib/audit";
import { applyTransaction } from "@/lib/billing";
import {
  isValidWebhookSignature,
  type PaystackTransaction,
} from "@/lib/paystack";

export const dynamic = "force-dynamic";

type WebhookBody = {
  event?: string;
  data?: Record<string, unknown> & { id?: number | string; reference?: string };
};

async function markSeen(eventKey: string, type: string, reference: string | null) {
  const [inserted] = await db
    .insert(paymentEvents)
    .values({ eventKey, type, reference })
    .onConflictDoNothing()
    .returning({ id: paymentEvents.id });

  return Boolean(inserted);
}

export async function POST(request: Request) {
  const rawBody = await request.text();

  if (!isValidWebhookSignature(rawBody, request.headers.get("x-paystack-signature"))) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }

  let body: WebhookBody;

  try {
    body = JSON.parse(rawBody) as WebhookBody;
  } catch {
    return NextResponse.json({ error: "Malformed body." }, { status: 400 });
  }

  const event = body.event ?? "";
  const data = body.data ?? {};
  const reference =
    typeof data.reference === "string"
      ? data.reference
      : typeof data.transaction_reference === "string"
        ? data.transaction_reference
        : null;

  if (event === "charge.success" && reference) {
    const eventKey = `${event}:${data.id ?? reference}`;
    const fresh = await markSeen(eventKey, event, reference);

    const result = await applyTransaction(data as unknown as PaystackTransaction);

    return NextResponse.json({ received: true, duplicate: !fresh, outcome: result.outcome });
  }

  if (event === "refund.processed" && reference) {
    const eventKey = `${event}:${data.id ?? reference}`;
    const fresh = await markSeen(eventKey, event, reference);

    if (fresh) {
      const [payment] = await db
        .update(payments)
        .set({ status: "refunded" })
        .where(eq(payments.providerReference, reference))
        .returning({ id: payments.id, organizationId: payments.organizationId });

      if (payment) {
        await logAudit({
          organizationId: payment.organizationId,
          module: "billing",
          action: "billing.payment_refunded",
          recordId: payment.id,
          newValue: { reference },
        });
      }
    }

    return NextResponse.json({ received: true });
  }

  return NextResponse.json({ received: true, ignored: event });
}
