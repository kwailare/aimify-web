// What Aimify needs from a payment company, in one shape, so billing,
// renewals and plan changes never talk to a particular company directly.
// Each provider (lib/payments/<id>.ts) turns its own API into these types;
// lib/payments/index.ts lists them and picks the one in use.

export const PROVIDER_IDS = ["paystack"] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

export class PaymentProviderError extends Error {
  constructor(
    message: string,
    readonly kind: "not_configured" | "unsafe_key" | "network" | "rejected",
  ) {
    super(message);
  }
}

/** A card the provider can charge again, without the customer. */
export type SavedCard = {
  // The provider's reusable token for the card (kept sealed at rest).
  token: string;
  email: string;
  customerCode: string | null;
  last4: string | null;
  brand: string | null;
  expMonth: string | null;
  expYear: string | null;
  bank: string | null;
};

/** A payment as the provider reports it. */
export type PaymentResult = {
  provider: ProviderId;
  reference: string;
  // success, failed (declined, abandoned, reversed) or pending (not final).
  status: "success" | "failed" | "pending";
  // In the currency's smallest unit (kobo for NGN).
  amountMinor: number;
  currency: string;
  paidAt: Date | null;
  channel: string | null;
  // The provider's own words on the outcome ("Approved", "Declined"...).
  message: string | null;
  // Set when the customer paid by a card the provider can charge again.
  card: SavedCard | null;
  email: string | null;
};

/** A webhook, understood: a payment, a refund, or something to ignore. */
export type WebhookEvent =
  | { kind: "payment"; eventId: string; result: PaymentResult }
  | { kind: "refund"; eventId: string; reference: string }
  | { kind: "ignored"; type: string };

export type CheckoutInput = {
  email: string;
  amountMinor: number;
  currency: string;
  reference: string;
  // Where the customer comes back to after paying.
  callbackUrl: string;
  metadata: Record<string, unknown>;
};

export type ChargeInput = {
  card: { token: string; email: string };
  amountMinor: number;
  currency: string;
  reference: string;
  metadata: Record<string, unknown>;
};

export interface PaymentProvider {
  id: ProviderId;
  name: string;
  /** Whether its keys are set. */
  isConfigured(): boolean;
  /** Live or test keys; null when not configured. */
  mode(): "live" | "test" | null;
  /** A page on the provider's site where the customer pays. */
  startCheckout(input: CheckoutInput): Promise<{ url: string }>;
  /** Asks the provider how a payment went. */
  verify(reference: string): Promise<PaymentResult>;
  /** Charges a saved card now. */
  chargeSavedCard(input: ChargeInput): Promise<PaymentResult>;
  /** Reads a webhook; null when its signature is not the provider's. */
  parseWebhook(rawBody: string, headers: Headers): WebhookEvent | null;
}
