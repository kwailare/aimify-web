import { and, eq, lt } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { memberships, organizations, users } from "@/db/schema";
import { logAudit } from "@/lib/audit";
import { applyScheduledPlanChanges } from "@/lib/plan-change";

type Organization = typeof organizations.$inferSelect;

/** A cheaper plan chosen for a period that has now started. */
async function applyPlanChangeIfDue(organization: Organization) {
  const at = organization.scheduledPlanAt;
  if (!organization.scheduledPlanId || !at || at > new Date()) return organization;
  await applyScheduledPlanChanges(new Date(), organization.id);
  const [current] = await db.select().from(organizations).where(eq(organizations.id, organization.id)).limit(1);
  return current ?? organization;
}

async function expireTrialIfNeeded(organization: Organization) {
  const { trialEndsAt } = organization;

  if (
    organization.subscriptionStatus !== "trial" ||
    !trialEndsAt ||
    trialEndsAt > new Date()
  ) {
    return organization;
  }

  const [expired] = await db
    .update(organizations)
    .set({ subscriptionStatus: "expired" })
    .where(
      and(
        eq(organizations.id, organization.id),
        eq(organizations.subscriptionStatus, "trial"),
        lt(organizations.trialEndsAt, new Date()),
      ),
    )
    .returning();

  if (expired) {
    await logAudit({
      organizationId: organization.id,
      module: "subscription",
      action: "subscription.expired",
      recordId: organization.id,
      previousValue: { subscriptionStatus: "trial" },
      newValue: { subscriptionStatus: "expired" },
    });
    return expired;
  }

  const [current] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, organization.id))
    .limit(1);

  return current ?? organization;
}

export async function getOrgContextForUser(userId: string) {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    return null;
  }

  const [row] = await db
    .select({ role: memberships.role, organization: organizations })
    .from(memberships)
    .innerJoin(organizations, eq(memberships.organizationId, organizations.id))
    .where(eq(memberships.userId, user.id))
    .limit(1);

  if (!row) {
    return { user, membership: null };
  }

  return {
    user,
    membership: {
      role: row.role,
      organization: await expireTrialIfNeeded(await applyPlanChangeIfDue(row.organization)),
    },
  };
}

export async function getOrgContext() {
  const session = await auth();

  if (!session?.user?.id) {
    return null;
  }

  return getOrgContextForUser(session.user.id);
}
