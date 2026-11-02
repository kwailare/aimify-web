import { and, eq, isNotNull, lte } from "drizzle-orm";
import { db } from "@/db";
import { organizations, payments, plans } from "@/db/schema";
import { logAudit } from "@/lib/audit";
import {
  addMonths,
  applyTransaction,
  getPaymentMethod,
  newReference,
  readAuthorizationCode,
  toKobo,
} from "@/lib/billing";
import { PaystackError, chargeAuthorization, initializeTransaction } from "@/lib/paystack";
import { type LimitKey, type OrgPlan, getOrgPlan, getUsage, limitFor, toOrgPlan } from "@/lib/plans";
import { SITE_URL } from "@/lib/site";

// Changing plan (feature checklist step 15).
//
// - Someone not paying for a period right now (on a trial, lapsed,
//   cancelled, overdue) switches at once; the new price applies when they
//   next pay.
// - A paying customer moving to a dearer plan switches at once and pays the
//   difference for the days left in the period; the renewal date stays.
// - A paying customer moving to a cheaper plan keeps the current one until
//   the end of the period paid for, then renews on the cheaper one. No
//   refunds. Choosing the current plan again cancels it.
// - Being over a plan's limits never deletes or locks anything: they just
//   can't add more until they're under.

/** Below this, an upgrade's difference isn't charged. */
export const MIN_UPGRADE_CHARGE = 100;
const DAY = 86_400_000;

export type OverLimit = { key: LimitKey; label: string; used: number; limit: number };

export type PlanChangeQuote = {
  current: OrgPlan;
  target: OrgPlan;
  // same: nothing to do (or cancel a scheduled change); switch: now, free;
  // upgrade: now, pays amountDue; downgrade: at effectiveAt.
  kind: "same" | "switch" | "upgrade" | "downgrade";
  amountDue: number;
  effectiveAt: Date | null;
  daysLeft: number | null;
  // The end of the period being paid for now, if any.
  periodEnd: Date | null;
  overLimits: OverLimit[];
  scheduled: { plan: OrgPlan; at: Date } | null;
};

const LABELS: Record<LimitKey, string> = {
  users: "team members",
  warehouses: "active warehouses",
  products: "active products",
};

export class PlanChangeError extends Error {}

async function loadOrg(organizationId: string) {
  const [org] = await db.select().from(organizations).where(eq(organizations.id, organizationId)).limit(1);
  if (!org) throw new PlanChangeError("Organization not found.");
  return org;
}

export async function activePlans() {
  const rows = await db.select().from(plans).where(eq(plans.isActive, true)).orderBy(plans.priceMonthly);
  return rows.map(toOrgPlan);
}

async function planById(id: string) {
  const [row] = await db.select().from(plans).where(eq(plans.id, id)).limit(1);
  return row ? { plan: toOrgPlan(row), active: row.isActive } : null;
}

/** Whether the organization is paying for a period that hasn't ended. */
function payingPeriod(org: typeof organizations.$inferSelect, now: Date) {
  return org.subscriptionStatus === "active" && org.currentPeriodEnd !== null && org.currentPeriodEnd > now
    ? org.currentPeriodEnd
    : null;
}

/** What moving to [targetPlanId] would mean, without changing anything. */
export async function quotePlanChange(organizationId: string, targetPlanId: string, now = new Date()): Promise<PlanChangeQuote> {
  const [org, current, found, usage] = await Promise.all([
    loadOrg(organizationId),
    getOrgPlan(organizationId),
    planById(targetPlanId),
    getUsage(organizationId),
  ]);
  if (!found || !found.active) throw new PlanChangeError("That plan isn't available.");
  const target = found.plan;
  const scheduledRow = org.scheduledPlanId ? await planById(org.scheduledPlanId) : null;
  const scheduled = scheduledRow && org.scheduledPlanAt ? { plan: scheduledRow.plan, at: org.scheduledPlanAt } : null;

  const overLimits: OverLimit[] = [];
  for (const key of ["users", "warehouses", "products"] as const) {
    const limit = limitFor(target, key);
    if (limit !== null && usage[key] > limit) overLimits.push({ key, label: LABELS[key], used: usage[key], limit });
  }

  const periodEnd = payingPeriod(org, now);
  const base = { current, target, overLimits, scheduled, periodEnd };
  if (target.id === current.id) {
    return { ...base, kind: "same", amountDue: 0, effectiveAt: null, daysLeft: null };
  }
  if (!periodEnd) {
    return { ...base, kind: "switch", amountDue: 0, effectiveAt: now, daysLeft: null };
  }
  const daysLeft = Math.ceil((periodEnd.getTime() - now.getTime()) / DAY);
  if (target.priceMonthly < current.priceMonthly) {
    return { ...base, kind: "downgrade", amountDue: 0, effectiveAt: periodEnd, daysLeft };
  }
  const length = periodEnd.getTime() - addMonths(periodEnd, -1).getTime();
  const share = Math.min(1, (periodEnd.getTime() - now.getTime()) / length);
  const difference = Math.round((target.priceMonthly - current.priceMonthly) * share);
  if (difference < MIN_UPGRADE_CHARGE) {
    return { ...base, kind: "switch", amountDue: 0, effectiveAt: now, daysLeft };
  }
  return { ...base, kind: "upgrade", amountDue: difference, effectiveAt: now, daysLeft };
}

export type PlanChangeResult =
  | { status: "unchanged" }
  | { status: "kept"; plan: string }
  | { status: "switched"; plan: string }
  | { status: "scheduled"; plan: string; at: Date }
  | { status: "upgraded"; plan: string; amount: number }
  | { status: "checkout"; url: string; reference: string }
  | { status: "declined"; reason: string };

/**
 * Moves the organization to [targetPlanId] by the rules above. An upgrade
 * charges the saved card when there is one (unless [checkout] asks for
 * Paystack's page, e.g. after the card was declined), else returns a
 * checkout URL; the plan changes when the payment succeeds.
 */
export async function changePlan(input: {
  organizationId: string;
  userId: string;
  email: string;
  targetPlanId: string;
  checkout?: boolean;
  now?: Date;
}): Promise<PlanChangeResult> {
  const now = input.now ?? new Date();
  const org = await loadOrg(input.organizationId);
  if (org.subscriptionStatus === "suspended") {
    throw new PlanChangeError("This organization is suspended. Contact support@aimify.app.");
  }
  const quote = await quotePlanChange(input.organizationId, input.targetPlanId, now);
  const audit = (action: string, newValue: Record<string, unknown>) =>
    logAudit({
      organizationId: org.id,
      userId: input.userId,
      module: "billing",
      action,
      recordId: org.id,
      previousValue: { plan: quote.current.name, scheduledPlan: quote.scheduled?.plan.name ?? null },
      newValue,
    });

  switch (quote.kind) {
    case "same": {
      if (!org.scheduledPlanId) return { status: "unchanged" };
      await db
        .update(organizations)
        .set({ scheduledPlanId: null, scheduledPlanAt: null })
        .where(eq(organizations.id, org.id));
      await audit("billing.plan_change_cancelled", { plan: quote.current.name });
      return { status: "kept", plan: quote.current.name };
    }
    case "switch": {
      await db
        .update(organizations)
        .set({ planId: quote.target.id, scheduledPlanId: null, scheduledPlanAt: null })
        .where(eq(organizations.id, org.id));
      await audit("billing.plan_changed", { plan: quote.target.name, overLimits: quote.overLimits });
      return { status: "switched", plan: quote.target.name };
    }
    case "downgrade": {
      await db
        .update(organizations)
        .set({ scheduledPlanId: quote.target.id, scheduledPlanAt: quote.effectiveAt })
        .where(eq(organizations.id, org.id));
      await audit("billing.plan_change_scheduled", {
        plan: quote.target.name,
        at: quote.effectiveAt!.toISOString(),
        overLimits: quote.overLimits,
      });
      return { status: "scheduled", plan: quote.target.name, at: quote.effectiveAt! };
    }
    case "upgrade":
      return upgrade(org, quote, input, now);
  }
}

async function upgrade(
  org: typeof organizations.$inferSelect,
  quote: PlanChangeQuote,
  input: { userId: string; email: string; checkout?: boolean },
  now: Date,
): Promise<PlanChangeResult> {
  const method = input.checkout ? null : await getPaymentMethod(org.id);
  const reference = newReference("checkout");
  await db.insert(payments).values({
    organizationId: org.id,
    amount: quote.amountDue,
    currency: "NGN",
    status: "pending",
    provider: "paystack",
    providerReference: reference,
    description: `Upgrade to ${quote.target.name} (${quote.daysLeft} day${quote.daysLeft === 1 ? "" : "s"} left in the period)`,
    kind: "upgrade",
    planId: quote.target.id,
    userId: input.userId,
    periodStart: now,
    periodEnd: org.currentPeriodEnd,
  });
  const metadata = { organizationId: org.id, userId: input.userId, purpose: "upgrade", planId: quote.target.id };

  if (!method) {
    try {
      const initialized = await initializeTransaction({
        email: input.email,
        amountKobo: toKobo(quote.amountDue),
        reference,
        callbackUrl: `${SITE_URL}/dashboard/billing/callback`,
        metadata,
      });
      return { status: "checkout", url: initialized.authorization_url, reference };
    } catch (error) {
      await markFailed(reference, error instanceof Error ? error.message : "initialize_failed");
      throw error;
    }
  }

  let reason = "declined";
  try {
    const tx = await chargeAuthorization({
      authorizationCode: readAuthorizationCode(method),
      email: method.email,
      amountKobo: toKobo(quote.amountDue),
      reference,
      metadata,
    });
    const applied = await applyTransaction(tx, now);
    if (applied.outcome === "activated" || applied.outcome === "already") {
      return { status: "upgraded", plan: quote.target.name, amount: quote.amountDue };
    }
    reason = tx.gateway_response ?? tx.status;
  } catch (error) {
    reason = error instanceof PaystackError ? error.message : "charge_failed";
  }
  await markFailed(reference, reason);
  return { status: "declined", reason };
}

async function markFailed(reference: string, reason: string) {
  await db
    .update(payments)
    .set({ status: "failed", failureReason: reason.slice(0, 200) })
    .where(and(eq(payments.providerReference, reference), eq(payments.status, "pending")));
}

/**
 * Puts scheduled plan changes whose time has come into effect: the period
 * they were chosen in has ended. A plan retired since is not applied.
 * Returns how many changed. Run by the renewals, and for one organization
 * when it is next used, so the change is never late.
 */
export async function applyScheduledPlanChanges(now = new Date(), organizationId?: string) {
  const due = await db
    .select({ id: organizations.id, planId: organizations.planId, scheduledPlanId: organizations.scheduledPlanId })
    .from(organizations)
    .where(
      and(
        isNotNull(organizations.scheduledPlanId),
        lte(organizations.scheduledPlanAt, now),
        organizationId ? eq(organizations.id, organizationId) : undefined,
      ),
    );
  let applied = 0;
  for (const org of due) {
    const found = await planById(org.scheduledPlanId!);
    const [updated] = await db
      .update(organizations)
      .set({
        ...(found?.active ? { planId: org.scheduledPlanId } : {}),
        scheduledPlanId: null,
        scheduledPlanAt: null,
      })
      .where(and(eq(organizations.id, org.id), eq(organizations.scheduledPlanId, org.scheduledPlanId!)))
      .returning({ id: organizations.id });
    if (!updated) continue;
    await logAudit({
      organizationId: org.id,
      module: "billing",
      action: found?.active ? "billing.plan_changed" : "billing.plan_change_dropped",
      recordId: org.id,
      newValue: found?.active
        ? { plan: found.plan.name, scheduled: true }
        : { reason: "The plan chosen is no longer offered." },
    });
    if (found?.active) applied += 1;
  }
  return applied;
}
