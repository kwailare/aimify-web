import {
  type PaystackTransaction,
  chargeAuthorization,
  initializeTransaction,
  isLiveKey,
  isPaystackConfigured,
  isValidWebhookSignature,
  verifyTransaction,
} from "@/lib/paystack";
import type { PaymentProvider, PaymentResult } from "@/lib/payments/types";

// Paystack as a payment provider: its API (lib/paystack.ts) turned into
// Aimify's provider shapes.

const FAILED = new Set(["failed", "abandoned", "reversed"]);

export function paystackResult(tx: PaystackTransaction): PaymentResult {
  const auth = tx.authorization;
  const reusableCard =
    !!auth?.authorization_code && auth.reusable === true && (auth.channel ?? tx.channel) === "card";
  const email = tx.customer?.email ?? null;
  return {
    provider: "paystack",
    reference: tx.reference,
    status: tx.status === "success" ? "success" : FAILED.has(tx.status) ? "failed" : "pending",
    amountMinor: tx.amount,
    currency: tx.currency,
    paidAt: tx.paid_at ? new Date(tx.paid_at) : null,
    channel: tx.channel ?? auth?.channel ?? null,
    message: tx.gateway_response ?? tx.status,
    card: reusableCard
      ? {
          token: auth!.authorization_code!,
          email: email ?? "",
          customerCode: tx.customer?.customer_code ?? null,
          last4: auth!.last4 ?? null,
          brand: auth!.brand ?? auth!.card_type ?? null,
          expMonth: auth!.exp_month ?? null,
          expYear: auth!.exp_year ?? null,
          bank: auth!.bank ?? null,
        }
      : null,
    email,
  };
}

export const paystack: PaymentProvider = {
  id: "paystack",
  name: "Paystack",

  isConfigured: isPaystackConfigured,

  mode() {
    const key = process.env.PAYSTACK_SECRET_KEY?.trim();
    if (!key) return null;
    return isLiveKey(key) ? "live" : "test";
  },

  async startCheckout(input) {
    const started = await initializeTransaction({
      email: input.email,
      amountKobo: input.amountMinor,
      reference: input.reference,
      callbackUrl: input.callbackUrl,
      metadata: input.metadata,
    });
    return { url: started.authorization_url };
  },

  async verify(reference) {
    return paystackResult(await verifyTransaction(reference));
  },

  async chargeSavedCard(input) {
    return paystackResult(
      await chargeAuthorization({
        authorizationCode: input.card.token,
        email: input.card.email,
        amountKobo: input.amountMinor,
        reference: input.reference,
        metadata: input.metadata,
      }),
    );
  },

  parseWebhook(rawBody, headers) {
    if (!isValidWebhookSignature(rawBody, headers.get("x-paystack-signature"))) return null;
    let body: { event?: string; data?: Record<string, unknown> };
    try {
      body = JSON.parse(rawBody);
    } catch {
      return null;
    }
    const event = body.event ?? "";
    const data = body.data ?? {};
    const reference =
      typeof data.reference === "string"
        ? data.reference
        : typeof data.transaction_reference === "string"
          ? data.transaction_reference
          : null;
    // Event ids keep the format used before providers, so a webhook
    // Paystack repeats is still recognised.
    const eventId = `${event}:${(data.id as string | number | undefined) ?? reference}`;
    if (event === "charge.success" && reference) {
      return { kind: "payment", eventId, result: paystackResult(data as unknown as PaystackTransaction) };
    }
    if (event === "refund.processed" && reference) {
      return { kind: "refund", eventId, reference };
    }
    return { kind: "ignored", type: event };
  },
};
