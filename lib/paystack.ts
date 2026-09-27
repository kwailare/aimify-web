import { createHmac, timingSafeEqual } from "crypto";

const API_BASE = "https://api.paystack.co";
const TIMEOUT_MS = 20000;

export class PaystackError extends Error {
  constructor(
    message: string,
    readonly kind: "not_configured" | "unsafe_key" | "network" | "rejected",
  ) {
    super(message);
  }
}

export type PaystackAuthorization = {
  authorization_code?: string;
  reusable?: boolean;
  channel?: string;
  last4?: string;
  brand?: string;
  card_type?: string;
  exp_month?: string;
  exp_year?: string;
  bank?: string;
};

export type PaystackTransaction = {
  id?: number;
  reference: string;
  status: string;
  amount: number;
  currency: string;
  paid_at?: string | null;
  channel?: string | null;
  gateway_response?: string | null;
  authorization?: PaystackAuthorization | null;
  customer?: { email?: string; customer_code?: string } | null;
  metadata?: Record<string, unknown> | null;
};

type Transport = (input: string, init?: RequestInit) => Promise<Response>;

let transport: Transport = (input, init) => fetch(input, init);

export function setPaystackTransportForTests(next: Transport | null) {
  transport = next ?? ((input, init) => fetch(input, init));
}

export function isLiveKey(key: string) {
  return key.startsWith("sk_live_");
}

export function isPaystackConfigured() {
  return Boolean(process.env.PAYSTACK_SECRET_KEY);
}

export function getSecretKey() {
  const key = process.env.PAYSTACK_SECRET_KEY?.trim();

  if (!key) {
    throw new PaystackError(
      "Payments aren't available right now.",
      "not_configured",
    );
  }

  const isProduction =
    process.env.VERCEL_ENV === "production" ||
    (process.env.NODE_ENV === "production" && !process.env.VERCEL_ENV);

  if (isLiveKey(key) && !isProduction) {
    throw new PaystackError(
      "A live Paystack key is set outside production. Use a test key (sk_test_) here.",
      "unsafe_key",
    );
  }

  return key;
}

async function call<T>(
  path: string,
  init: { method?: "GET" | "POST"; body?: unknown } = {},
): Promise<T> {
  const key = getSecretKey();

  let response: Response;

  try {
    response = await transport(`${API_BASE}${path}`, {
      method: init.method ?? "GET",
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new PaystackError(
      "We couldn't reach Paystack. Please try again in a moment.",
      "network",
    );
  }

  const json = (await response.json().catch(() => null)) as {
    status?: boolean;
    message?: string;
    data?: T;
  } | null;

  if (!json || json.status !== true || json.data === undefined) {
    throw new PaystackError(
      json?.message ?? "Paystack rejected the request.",
      "rejected",
    );
  }

  return json.data;
}

export async function initializeTransaction(input: {
  email: string;
  amountKobo: number;
  reference: string;
  callbackUrl: string;
  metadata: Record<string, unknown>;
}) {
  return call<{ authorization_url: string; access_code: string; reference: string }>(
    "/transaction/initialize",
    {
      method: "POST",
      body: {
        email: input.email,
        amount: input.amountKobo,
        currency: "NGN",
        reference: input.reference,
        callback_url: input.callbackUrl,
        metadata: input.metadata,
      },
    },
  );
}

export async function verifyTransaction(reference: string) {
  return call<PaystackTransaction>(
    `/transaction/verify/${encodeURIComponent(reference)}`,
  );
}

export async function chargeAuthorization(input: {
  authorizationCode: string;
  email: string;
  amountKobo: number;
  reference: string;
  metadata: Record<string, unknown>;
}) {
  return call<PaystackTransaction>("/transaction/charge_authorization", {
    method: "POST",
    body: {
      authorization_code: input.authorizationCode,
      email: input.email,
      amount: input.amountKobo,
      currency: "NGN",
      reference: input.reference,
      metadata: input.metadata,
    },
  });
}

export function signPayload(rawBody: string, secret: string) {
  return createHmac("sha512", secret).update(rawBody).digest("hex");
}

export function isValidWebhookSignature(
  rawBody: string,
  signature: string | null,
) {
  const key = process.env.PAYSTACK_SECRET_KEY?.trim();

  if (!key || !signature) return false;

  const expected = Buffer.from(signPayload(rawBody, key), "utf8");
  const received = Buffer.from(signature.trim(), "utf8");

  return expected.length === received.length && timingSafeEqual(expected, received);
}
