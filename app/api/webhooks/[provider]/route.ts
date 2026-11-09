import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { paymentEvents, payments } from "@/db/schema";
import { logAudit } from "@/lib/audit";
import { applyTransaction } from "@/lib/billing";
import { getProvider, isProviderId } from "@/lib/payments";

export const dynamic = "force-dynamic";

// Each payment provider's webhook: /api/webhooks/<provider> (Paystack's is
// /api/webhooks/paystack). The provider checks the signature and says what
// happened; a payment is applied once however often it is sent.

async function markSeen(eventKey: string, type: string, reference: string | null) {
  const [inserted] = await db
    .insert(paymentEvents)
    .values({ eventKey, type, reference })
    .onConflictDoNothing()
    .returning({ id: paymentEvents.id });

  return Boolean(inserted);
}

export async function POST(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider: id } = await params;
  if (!isProviderId(id)) {
    return NextResponse.json({ error: "Unknown payment provider." }, { status: 404 });
  }
  const provider = getProvider(id);

  const rawBody = await request.text();
  const event = provider.parseWebhook(rawBody, request.headers);
  if (!event) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }

  if (event.kind === "payment") {
    const fresh = await markSeen(event.eventId, "charge.success", event.result.reference);
    const result = await applyTransaction(event.result);
    return NextResponse.json({ received: true, duplicate: !fresh, outcome: result.outcome });
  }

  if (event.kind === "refund") {
    const fresh = await markSeen(event.eventId, "refund.processed", event.reference);
    if (fresh) {
      const [payment] = await db
        .update(payments)
        .set({ status: "refunded" })
        .where(and(eq(payments.providerReference, event.reference), eq(payments.provider, provider.id)))
        .returning({ id: payments.id, organizationId: payments.organizationId });

      if (payment) {
        await logAudit({
          organizationId: payment.organizationId,
          module: "billing",
          action: "billing.payment_refunded",
          recordId: payment.id,
          newValue: { reference: event.reference, provider: provider.id },
        });
      }
    }
    return NextResponse.json({ received: true });
  }

  return NextResponse.json({ received: true, ignored: event.type });
}
