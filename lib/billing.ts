import { randomBytes } from "crypto";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { organizations, paymentMethods, payments } from "@/db/schema";
import { logAudit } from "@/lib/audit";
import { sendReceiptEmail } from "@/lib/billing-emails";
import { openSecret, sealSecret } from "@/lib/crypto-box";
import {
  PaystackError,
  initializeTransaction,
  type PaystackTransaction,
} from "@/lib/paystack";
import { getOrgPlan } from "@/lib/plans";
import { SITE_URL } from "@/lib/site";

export const GRACE_DAYS = 3;
export const MAX_RENEWAL_ATTEMPTS = 3;
const DAY = 24 * 60 * 60 * 1000;
const SECRET_PURPOSE = "paystack-authorization";

export function toKobo(amount: number) {
  return Math.round(amount * 100);
}

export function addMonths(date: Date, months: number) {
  const result = new Date(date.getTime());
  const day = result.getUTCDate();

  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);

  const lastDay = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
  ).getUTCDate();

  result.setUTCDate(Math.min(day, lastDay));

  return result;
}

export function newReference(kind: "checkout" | "renewal") {
  return `aim-${kind === "checkout" ? "c" : "r"}-${randomBytes(10).toString("hex")}`;
}

export function billingPeriodBase(
  org: {
    subscriptionStatus: string;
    currentPeriodEnd: Date | null;
    trialEndsAt: Date | null;
  },
  now: Date,
) {
  let base = now;

  if (
    (org.subscriptionStatus === "active" ||
      org.subscriptionStatus === "past_due") &&
    org.currentPeriodEnd &&
    now.getTime() - org.currentPeriodEnd.getTime() <= GRACE_DAYS * DAY
  ) {
    base = org.currentPeriodEnd;
  }

  if (
    org.subscriptionStatus === "trial" &&
    org.trialEndsAt &&
    org.trialEndsAt > base
  ) {
    base = org.trialEndsAt;
  }

  return base;
}

export async function getPaymentMethod(organizationId: string) {
  const [row] = await db
    .select()
    .from(paymentMethods)
    .where(eq(paymentMethods.organizationId, organizationId))
    .limit(1);

  return row ?? null;
}

export function readAuthorizationCode(method: { authorizationCode: string }) {
  return openSecret(SECRET_PURPOSE, method.authorizationCode);
}

async function savePaymentMethod(
  organizationId: string,
  tx: PaystackTransaction,
  fallbackEmail: string,
) {
  const authorization = tx.authorization;

  if (
    !authorization?.authorization_code ||
    authorization.reusable !== true ||
    (authorization.channel ?? tx.channel) !== "card"
  ) {
    return;
  }

  const values = {
    organizationId,
    authorizationCode: sealSecret(SECRET_PURPOSE, authorization.authorization_code),
    email: tx.customer?.email ?? fallbackEmail,
    customerCode: tx.customer?.customer_code ?? null,
    last4: authorization.last4 ?? null,
    brand: authorization.brand ?? authorization.card_type ?? null,
    expMonth: authorization.exp_month ?? null,
    expYear: authorization.exp_year ?? null,
    bank: authorization.bank ?? null,
    updatedAt: new Date(),
  };

  await db
    .insert(paymentMethods)
    .values(values)
    .onConflictDoUpdate({
      target: paymentMethods.organizationId,
      set: values,
    });
}

export async function removePaymentMethod(organizationId: string) {
  await db
    .delete(paymentMethods)
    .where(eq(paymentMethods.organizationId, organizationId));
}

export async function startCheckout(entry: {
  organizationId: string;
  userId: string;
  email: string;
}) {
  const plan = await getOrgPlan(entry.organizationId);

  if (!(plan.priceMonthly > 0)) {
    throw new PaystackError("This plan has no price set.", "rejected");
  }

  const reference = newReference("checkout");

  await db.insert(payments).values({
    organizationId: entry.organizationId,
    amount: plan.priceMonthly,
    currency: "NGN",
    status: "pending",
    provider: "paystack",
    providerReference: reference,
    description: `${plan.name} subscription`,
    kind: "checkout",
    userId: entry.userId,
  });

  try {
    const initialized = await initializeTransaction({
      email: entry.email,
      amountKobo: toKobo(plan.priceMonthly),
      reference,
      callbackUrl: `${SITE_URL}/dashboard/billing/callback`,
      metadata: {
        organizationId: entry.organizationId,
        userId: entry.userId,
        purpose: "subscription",
      },
    });

    return { url: initialized.authorization_url, reference };
  } catch (error) {
    await db
      .update(payments)
      .set({
        status: "failed",
        failureReason: error instanceof Error ? error.message.slice(0, 200) : "initialize_failed",
      })
      .where(eq(payments.providerReference, reference));

    throw error;
  }
}

export type ApplyOutcome =
  | { outcome: "activated"; organizationId: string; periodEnd: Date | null }
  | { outcome: "already" | "unknown" | "pending" | "failed" | "mismatch"; organizationId?: string };

export async function applyTransaction(
  tx: PaystackTransaction,
  now = new Date(),
): Promise<ApplyOutcome> {
  const [payment] = await db
    .select()
    .from(payments)
    .where(eq(payments.providerReference, tx.reference))
    .limit(1);

  if (!payment) return { outcome: "unknown" };

  if (payment.status === "succeeded" || payment.status === "refunded") {
    return { outcome: "already", organizationId: payment.organizationId };
  }

  if (tx.status !== "success") {
    if (["failed", "abandoned", "reversed"].includes(tx.status)) {
      await db
        .update(payments)
        .set({
          status: "failed",
          failureReason: (tx.gateway_response ?? tx.status).slice(0, 200),
        })
        .where(and(eq(payments.id, payment.id), eq(payments.status, "pending")));

      return { outcome: "failed", organizationId: payment.organizationId };
    }

    return { outcome: "pending", organizationId: payment.organizationId };
  }

  if (
    tx.amount !== toKobo(payment.amount) ||
    tx.currency !== payment.currency
  ) {
    await db
      .update(payments)
      .set({ status: "failed", failureReason: "amount_or_currency_mismatch" })
      .where(and(eq(payments.id, payment.id), eq(payments.status, "pending")));

    await logAudit({
      organizationId: payment.organizationId,
      module: "billing",
      action: "billing.payment_mismatch",
      recordId: payment.id,
      newValue: {
        reference: tx.reference,
        expected: toKobo(payment.amount),
        received: tx.amount,
      },
    });

    return { outcome: "mismatch", organizationId: payment.organizationId };
  }

  const [claimed] = await db
    .update(payments)
    .set({
      status: "succeeded",
      paidAt: tx.paid_at ? new Date(tx.paid_at) : now,
      channel: tx.channel ?? tx.authorization?.channel ?? null,
      failureReason: null,
    })
    .where(
      and(
        eq(payments.id, payment.id),
        inArray(payments.status, ["pending", "failed"]),
      ),
    )
    .returning({ id: payments.id });

  if (!claimed) {
    return { outcome: "already", organizationId: payment.organizationId };
  }

  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, payment.organizationId))
    .limit(1);

  if (!org) return { outcome: "unknown" };

  await savePaymentMethod(
    org.id,
    tx,
    tx.customer?.email ?? "",
  );

  if (org.subscriptionStatus === "suspended") {
    await logAudit({
      organizationId: org.id,
      module: "billing",
      action: "billing.payment_while_suspended",
      recordId: payment.id,
      newValue: { reference: tx.reference },
    });

    return { outcome: "activated", organizationId: org.id, periodEnd: null };
  }

  const periodStart = billingPeriodBase(org, now);
  const periodEnd = addMonths(periodStart, 1);

  await db
    .update(payments)
    .set({ periodStart, periodEnd })
    .where(eq(payments.id, payment.id));

  await db
    .update(organizations)
    .set({
      subscriptionStatus: "active",
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: false,
      renewalAttempts: 0,
      lastRenewalAttemptAt: null,
    })
    .where(eq(organizations.id, org.id));

  await logAudit({
    organizationId: org.id,
    userId: payment.userId,
    module: "billing",
    action: "billing.payment_succeeded",
    recordId: payment.id,
    previousValue: { subscriptionStatus: org.subscriptionStatus },
    newValue: {
      subscriptionStatus: "active",
      reference: tx.reference,
      amount: payment.amount,
      periodEnd: periodEnd.toISOString(),
      kind: payment.kind,
    },
  });

  await sendReceiptEmail({
    organizationId: org.id,
    organizationName: org.name,
    amount: payment.amount,
    reference: tx.reference,
    periodEnd,
    kind: payment.kind,
  });

  return { outcome: "activated", organizationId: org.id, periodEnd };
}
