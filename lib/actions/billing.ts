"use server";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { logAudit } from "@/lib/audit";
import { removePaymentMethod, startCheckout } from "@/lib/billing";
import { getOrgContext } from "@/lib/org";
import { PaystackError } from "@/lib/paystack";
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
    if (error instanceof PaystackError) {
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
