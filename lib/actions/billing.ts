"use server";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { logAudit } from "@/lib/audit";
import { getPaymentMethod, removePaymentMethod, startCheckout } from "@/lib/billing";
import { PlanChangeError, changePlan, quotePlanChange } from "@/lib/plan-change";
import { getOrgContext } from "@/lib/org";
import { PaymentProviderError } from "@/lib/payments";
import { isRateLimited, recordLoginAttempt } from "@/lib/rate-limit";
import { canManageTeam } from "@/lib/roles";

async function billingManager() {
  const context = await getOrgContext();

  if (!context?.membership || !context.user.emailVerifiedAt) return null;

  const { organization, role } = context.membership;

  if (!canManageTeam(role)) return null;

  return { user: context.user, organization, role };
}

export async function startCheckoutAction() {
  const manager = await billingManager();

  if (!manager) {
    return { error: "Only an Owner or Administrator can make payments." };
  }

  if (manager.organization.subscriptionStatus === "suspended") {
    return {
      error: "This organization is suspended. Contact support@aimify.app.",
    };
  }

  const identifiers = [`checkout:${manager.organization.id}`];

  if (await isRateLimited(identifiers)) {
    return { error: "Too many payment attempts. Please wait a few minutes." };
  }

  await recordLoginAttempt(identifiers, false);

  try {
    const checkout = await startCheckout({
      organizationId: manager.organization.id,
      userId: manager.user.id,
      email: manager.user.email,
    });

    await logAudit({
      organizationId: manager.organization.id,
      userId: manager.user.id,
      module: "billing",
      action: "billing.checkout_started",
      recordId: checkout.reference,
    });

    return { url: checkout.url };
  } catch (error) {
    if (error instanceof PaymentProviderError) {
      return { error: error.message };
    }

    return { error: "We couldn't start the payment. Please try again." };
  }
}

export async function removeCardAction() {
  const manager = await billingManager();

  if (!manager) {
    return { error: "Only an Owner or Administrator can change payment details." };
  }

  await removePaymentMethod(manager.organization.id);

  await logAudit({
    organizationId: manager.organization.id,
    userId: manager.user.id,
    module: "billing",
    action: "billing.card_removed",
    recordId: manager.organization.id,
  });

  return { success: true };
}

export async function resumeSubscriptionAction() {
  const manager = await billingManager();

  if (!manager || manager.role !== "Owner") {
    return { error: "Only an Owner can resume the subscription." };
  }

  const [updated] = await db
    .update(organizations)
    .set({ cancelAtPeriodEnd: false })
    .where(eq(organizations.id, manager.organization.id))
    .returning({ id: organizations.id });

  if (!updated) return { error: "Organization not found." };

  await logAudit({
    organizationId: manager.organization.id,
    userId: manager.user.id,
    module: "subscription",
    action: "subscription.cancel_reverted",
    recordId: manager.organization.id,
  });

  return { success: true };
}

async function planOwner() {
  const manager = await billingManager();
  if (!manager || manager.role !== "Owner") return null;
  return manager;
}

/** What choosing a plan would mean, for the confirmation step. */
export async function quotePlanChangeAction(planId: string) {
  const owner = await planOwner();
  if (!owner) return { error: "Only the Owner can change the plan." };
  try {
    const q = await quotePlanChange(owner.organization.id, planId);
    const hasCard = Boolean(await getPaymentMethod(owner.organization.id));
    return {
      quote: {
        kind: q.kind,
        target: q.target.name,
        targetPrice: q.target.priceMonthly,
        current: q.current.name,
        amountDue: q.amountDue,
        daysLeft: q.daysLeft,
        effectiveAt: q.effectiveAt?.toISOString() ?? null,
        periodEnd: q.periodEnd?.toISOString() ?? null,
        overLimits: q.overLimits,
        scheduled: q.scheduled ? { plan: q.scheduled.plan.name, at: q.scheduled.at.toISOString() } : null,
        hasCard,
      },
    };
  } catch (error) {
    if (error instanceof PlanChangeError) return { error: error.message };
    throw error;
  }
}

/**
 * Moves to [planId]: at once, at the end of the period, or after paying the
 * difference (the saved card, or Paystack's page when [checkout]).
 */
export async function changePlanAction(planId: string, options: { checkout?: boolean } = {}) {
  const owner = await planOwner();
  if (!owner) return { error: "Only the Owner can change the plan." };

  try {
    // Only a change that charges counts towards the payment attempts limit.
    const quote = await quotePlanChange(owner.organization.id, planId);
    if (quote.kind === "upgrade") {
      const identifiers = [`checkout:${owner.organization.id}`];
      if (await isRateLimited(identifiers)) {
        return { error: "Too many payment attempts. Please wait a few minutes." };
      }
      await recordLoginAttempt(identifiers, false);
    }

    const result = await changePlan({
      organizationId: owner.organization.id,
      userId: owner.user.id,
      email: owner.user.email,
      targetPlanId: planId,
      checkout: options.checkout,
    });
    return result.status === "scheduled" ? { ...result, at: result.at.toISOString() } : result;
  } catch (error) {
    if (error instanceof PlanChangeError || error instanceof PaymentProviderError) return { error: error.message };
    return { error: "We couldn't change the plan. Please try again." };
  }
}
