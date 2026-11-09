import { randomBytes } from "crypto";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { organizations, paymentMethods, payments, plans } from "@/db/schema";
import { logAudit } from "@/lib/audit";
import { sendReceiptEmail } from "@/lib/billing-emails";
import { openSecret, sealSecret } from "@/lib/crypto-box";
import { PaymentProviderError, type PaymentResult, activeProvider } from "@/lib/payments";
import { getOrgPlan, toOrgPlan } from "@/lib/plans";
import { SITE_URL } from "@/lib/site";

export const GRACE_DAYS = 3;
export const MAX_RENEWAL_ATTEMPTS = 3;
const DAY = 24 * 60 * 60 * 1000;
// Saved card tokens are sealed under this purpose (named when Paystack was
// the only provider; kept so existing cards still open).
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

/** The saved card's token, unsealed, for its provider to charge. */
export function readCardToken(method: { authorizationCode: string }) {
  return openSecret(SECRET_PURPOSE, method.authorizationCode);
}

/** Keeps a card the customer paid with, for renewals, with its provider. */
async function savePaymentMethod(organizationId: string, result: PaymentResult, fallbackEmail: string) {
  const card = result.card;
  if (!card) return;

  const values = {
    organizationId,
    provider: result.provider,
    authorizationCode: sealSecret(SECRET_PURPOSE, card.token),
    email: card.email || fallbackEmail,
    customerCode: card.customerCode,
    last4: card.last4,
    brand: card.brand,
    expMonth: card.expMonth,
    expYear: card.expYear,
    bank: card.bank,
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

/**
 * The plan a payment made now pays for: the current one, or a cheaper one
 * already chosen to start by the time the period being bought begins.
 */
export async function planForNextPeriod(organizationId: string, now = new Date()) {
  const [org] = await db.select().from(organizations).where(eq(organizations.id, organizationId)).limit(1);
  if (org?.scheduledPlanId && org.scheduledPlanAt && org.scheduledPlanAt <= billingPeriodBase(org, now)) {
    const [row] = await db.select().from(plans).where(eq(plans.id, org.scheduledPlanId)).limit(1);
    if (row?.isActive) return toOrgPlan(row);
  }
  return getOrgPlan(organizationId);
}

export async function startCheckout(entry: {
  organizationId: string;
  userId: string;
  email: string;
}) {
  const plan = await planForNextPeriod(entry.organizationId);

  if (!(plan.priceMonthly > 0)) {
    throw new PaymentProviderError("This plan has no price set.", "rejected");
  }

  const provider = await activeProvider();
  if (!provider.isConfigured()) {
    throw new PaymentProviderError("Payments aren't available right now.", "not_configured");
  }
  const reference = newReference("checkout");

  await db.insert(payments).values({
    organizationId: entry.organizationId,
    amount: plan.priceMonthly,
    currency: "NGN",
    status: "pending",
    provider: provider.id,
    providerReference: reference,
    description: `${plan.name} subscription`,
    kind: "checkout",
    planId: plan.id,
    userId: entry.userId,
  });

  try {
    const started = await provider.startCheckout({
      email: entry.email,
      amountMinor: toKobo(plan.priceMonthly),
      currency: "NGN",
      reference,
      callbackUrl: `${SITE_URL}/dashboard/billing/callback`,
      metadata: {
        organizationId: entry.organizationId,
        userId: entry.userId,
        purpose: "subscription",
      },
    });

    return { url: started.url, reference };
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

/**
 * Records what a provider reported about a payment (from the checkout
 * page, a webhook or a card charge), once: marks it paid or failed and, when
 * paid, extends the subscription or applies the upgrade.
 */
export async function applyTransaction(
  tx: PaymentResult,
  now = new Date(),
): Promise<ApplyOutcome> {
  const [payment] = await db
    .select()
    .from(payments)
    .where(eq(payments.providerReference, tx.reference))
    .limit(1);

  // Only the provider the payment was started with can settle it.
  if (!payment || (payment.provider && payment.provider !== tx.provider)) return { outcome: "unknown" };

  if (payment.status === "succeeded" || payment.status === "refunded") {
    return { outcome: "already", organizationId: payment.organizationId };
  }

  if (tx.status !== "success") {
    if (tx.status === "failed") {
      await db
        .update(payments)
        .set({
          status: "failed",
          failureReason: (tx.message ?? tx.status).slice(0, 200),
        })
        .where(and(eq(payments.id, payment.id), eq(payments.status, "pending")));

      return { outcome: "failed", organizationId: payment.organizationId };
    }

    return { outcome: "pending", organizationId: payment.organizationId };
  }

  if (
    tx.amountMinor !== toKobo(payment.amount) ||
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
        received: tx.amountMinor,
      },
    });

    return { outcome: "mismatch", organizationId: payment.organizationId };
  }

  const [claimed] = await db
    .update(payments)
    .set({
      status: "succeeded",
      paidAt: tx.paidAt ?? now,
      channel: tx.channel,
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
    tx.email ?? "",
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

  if (payment.kind === "upgrade") {
    // The rest of the current period on a dearer plan: the plan changes
    // now, the renewal date doesn't.
    await db
      .update(organizations)
      .set({ planId: payment.planId, scheduledPlanId: null, scheduledPlanAt: null })
      .where(eq(organizations.id, org.id));
    const [plan] = payment.planId
      ? await db.select({ name: plans.name }).from(plans).where(eq(plans.id, payment.planId)).limit(1)
      : [];

    await logAudit({
      organizationId: org.id,
      userId: payment.userId,
      module: "billing",
      action: "billing.plan_upgraded",
      recordId: payment.id,
      previousValue: { planId: org.planId },
      newValue: { plan: plan?.name ?? null, reference: tx.reference, amount: payment.amount },
    });

    if (org.currentPeriodEnd) {
      await sendReceiptEmail({
        organizationId: org.id,
        organizationName: org.name,
        amount: payment.amount,
        reference: tx.reference,
        periodEnd: org.currentPeriodEnd,
        kind: payment.kind,
        planName: plan?.name,
      });
    }

    return { outcome: "activated", organizationId: org.id, periodEnd: org.currentPeriodEnd };
  }

  const periodStart = billingPeriodBase(org, now);
  // A period starting now is on the plan it was paid for (a cheaper one
  // chosen for it takes effect). Paying ahead leaves the plan as it is
  // until then.
  const planNow =
    payment.planId && periodStart <= now
      ? {
          planId: payment.planId,
          ...(org.scheduledPlanId === payment.planId ? { scheduledPlanId: null, scheduledPlanAt: null } : {}),
        }
      : {};
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
      ...planNow,
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
