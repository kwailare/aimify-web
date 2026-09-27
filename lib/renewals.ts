import { and, eq, gt, isNotNull, lt, lte } from "drizzle-orm";
import { db } from "@/db";
import { organizations, payments, subscriptionNotices } from "@/db/schema";
import { logAudit } from "@/lib/audit";
import {
  GRACE_DAYS,
  MAX_RENEWAL_ATTEMPTS,
  applyTransaction,
  getPaymentMethod,
  newReference,
  readAuthorizationCode,
  toKobo,
} from "@/lib/billing";
import {
  sendLapsedEmail,
  sendPaymentFailedEmail,
  sendRenewalReminderEmail,
} from "@/lib/billing-emails";
import {
  PaystackError,
  chargeAuthorization,
  isPaystackConfigured,
} from "@/lib/paystack";
import { getOrgPlan } from "@/lib/plans";
import { notifySubscriptionChange } from "@/lib/subscription-notices";

const DAY = 24 * 60 * 60 * 1000;
const RETRY_GAP_MS = 20 * 60 * 60 * 1000;
const REMINDER_DAYS = 3;

type Org = typeof organizations.$inferSelect;

export type RenewalSummary = {
  charged: number;
  failed: number;
  movedToPastDue: number;
  lapsed: number;
  cancelledAtPeriodEnd: number;
  reminders: number;
  abandoned: number;
  skipped: string | null;
};

async function attemptCharge(org: Org, now: Date) {
  const method = await getPaymentMethod(org.id);
  const plan = await getOrgPlan(org.id);

  if (!method || !(plan.priceMonthly > 0)) {
    return { charged: false as const, hadCard: Boolean(method), amount: plan.priceMonthly };
  }

  const reference = newReference("renewal");

  await db.insert(payments).values({
    organizationId: org.id,
    amount: plan.priceMonthly,
    currency: "NGN",
    status: "pending",
    provider: "paystack",
    providerReference: reference,
    description: `${plan.name} subscription (renewal)`,
    kind: "renewal",
  });

  let outcome: string;
  let reason: string | null = null;

  try {
    const tx = await chargeAuthorization({
      authorizationCode: readAuthorizationCode(method),
      email: method.email,
      amountKobo: toKobo(plan.priceMonthly),
      reference,
      metadata: { organizationId: org.id, purpose: "renewal" },
    });

    const applied = await applyTransaction(tx, now);
    outcome = applied.outcome;
    reason = tx.gateway_response ?? tx.status;
  } catch (error) {
    outcome = "error";
    reason =
      error instanceof PaystackError ? error.message : "charge_failed";
  }

  if (outcome === "activated") {
    return { charged: true as const };
  }

  await db
    .update(payments)
    .set({ status: "failed", failureReason: (reason ?? "declined").slice(0, 200) })
    .where(and(eq(payments.providerReference, reference), eq(payments.status, "pending")));

  return { charged: false as const, hadCard: true, amount: plan.priceMonthly };
}

async function claimReminder(organizationId: string, period: string) {
  const [claimed] = await db
    .insert(subscriptionNotices)
    .values({ organizationId, kind: "renewal_upcoming", period })
    .onConflictDoNothing()
    .returning({ id: subscriptionNotices.id });

  return claimed?.id ?? null;
}

export async function runRenewals(now = new Date()): Promise<RenewalSummary> {
  const summary: RenewalSummary = {
    charged: 0,
    failed: 0,
    movedToPastDue: 0,
    lapsed: 0,
    cancelledAtPeriodEnd: 0,
    reminders: 0,
    abandoned: 0,
    skipped: null,
  };

  if (!isPaystackConfigured()) {
    summary.skipped = "Paystack is not configured.";
    return summary;
  }

  const abandoned = await db
    .update(payments)
    .set({ status: "abandoned" })
    .where(
      and(
        eq(payments.status, "pending"),
        lt(payments.createdAt, new Date(now.getTime() - 2 * DAY)),
      ),
    )
    .returning({ id: payments.id });

  summary.abandoned = abandoned.length;

  const dueActive = await db
    .select()
    .from(organizations)
    .where(
      and(
        eq(organizations.subscriptionStatus, "active"),
        isNotNull(organizations.currentPeriodEnd),
        lte(organizations.currentPeriodEnd, now),
      ),
    );

  for (const org of dueActive) {
    if (org.cancelAtPeriodEnd) {
      await db
        .update(organizations)
        .set({ subscriptionStatus: "cancelled", cancelAtPeriodEnd: false })
        .where(eq(organizations.id, org.id));

      await logAudit({
        organizationId: org.id,
        module: "subscription",
        action: "subscription.cancelled",
        recordId: org.id,
        previousValue: { subscriptionStatus: "active" },
        newValue: { subscriptionStatus: "cancelled", atPeriodEnd: true },
      });

      await notifySubscriptionChange(org.id, "cancelled");
      summary.cancelledAtPeriodEnd += 1;
      continue;
    }

    const result = await attemptCharge(org, now);

    if (result.charged) {
      summary.charged += 1;
      continue;
    }

    const graceEnds = new Date(org.currentPeriodEnd!.getTime() + GRACE_DAYS * DAY);

    await db
      .update(organizations)
      .set({
        subscriptionStatus: "past_due",
        renewalAttempts: result.hadCard ? 1 : 0,
        lastRenewalAttemptAt: now,
      })
      .where(eq(organizations.id, org.id));

    await logAudit({
      organizationId: org.id,
      module: "billing",
      action: "billing.renewal_failed",
      recordId: org.id,
      previousValue: { subscriptionStatus: "active" },
      newValue: { subscriptionStatus: "past_due", hadCard: result.hadCard },
    });

    await sendPaymentFailedEmail({
      organizationId: org.id,
      organizationName: org.name,
      amount: result.amount,
      graceEnds,
      hasCard: result.hadCard,
    });

    summary.movedToPastDue += 1;
    if (result.hadCard) summary.failed += 1;
  }

  const pastDue = await db
    .select()
    .from(organizations)
    .where(
      and(
        eq(organizations.subscriptionStatus, "past_due"),
        isNotNull(organizations.currentPeriodEnd),
      ),
    );

  for (const org of pastDue) {
    const graceEnds = new Date(org.currentPeriodEnd!.getTime() + GRACE_DAYS * DAY);

    if (now > graceEnds) {
      await db
        .update(organizations)
        .set({ subscriptionStatus: "expired" })
        .where(eq(organizations.id, org.id));

      await logAudit({
        organizationId: org.id,
        module: "billing",
        action: "billing.subscription_lapsed",
        recordId: org.id,
        previousValue: { subscriptionStatus: "past_due" },
        newValue: { subscriptionStatus: "expired" },
      });

      await sendLapsedEmail({ organizationId: org.id, organizationName: org.name });
      summary.lapsed += 1;
      continue;
    }

    const recentlyTried =
      org.lastRenewalAttemptAt &&
      now.getTime() - org.lastRenewalAttemptAt.getTime() < RETRY_GAP_MS;

    if (org.renewalAttempts >= MAX_RENEWAL_ATTEMPTS || recentlyTried) continue;

    const method = await getPaymentMethod(org.id);

    if (!method) continue;

    const result = await attemptCharge(org, now);

    if (result.charged) {
      summary.charged += 1;
      continue;
    }

    await db
      .update(organizations)
      .set({
        renewalAttempts: org.renewalAttempts + 1,
        lastRenewalAttemptAt: now,
      })
      .where(eq(organizations.id, org.id));

    summary.failed += 1;
  }

  const upcoming = await db
    .select()
    .from(organizations)
    .where(
      and(
        eq(organizations.subscriptionStatus, "active"),
        eq(organizations.cancelAtPeriodEnd, false),
        isNotNull(organizations.currentPeriodEnd),
        gt(organizations.currentPeriodEnd, now),
        lte(
          organizations.currentPeriodEnd,
          new Date(now.getTime() + REMINDER_DAYS * DAY),
        ),
      ),
    );

  for (const org of upcoming) {
    const period = org.currentPeriodEnd!.toISOString();
    const claim = await claimReminder(org.id, period);

    if (!claim) continue;

    const method = await getPaymentMethod(org.id);
    const plan = await getOrgPlan(org.id);

    const sent = await sendRenewalReminderEmail({
      organizationId: org.id,
      organizationName: org.name,
      amount: plan.priceMonthly,
      renewsOn: org.currentPeriodEnd!,
      hasCard: Boolean(method),
    });

    if (!sent) {
      await db
        .delete(subscriptionNotices)
        .where(eq(subscriptionNotices.id, claim));
    } else {
      summary.reminders += 1;
    }
  }

  return summary;
}
