"use server";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { getAdminContext } from "@/lib/admin";
import { logAudit } from "@/lib/audit";

export async function suspendOrganizationAction(organizationId: string) {
  const context = await getAdminContext();

  if (!context) {
    return { error: "Not authorized." };
  }

  const [before] = await db
    .select({ subscriptionStatus: organizations.subscriptionStatus })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);

  if (!before) {
    return { error: "Organization not found." };
  }

  await db
    .update(organizations)
    .set({ subscriptionStatus: "suspended" })
    .where(eq(organizations.id, organizationId));

  await logAudit({
    organizationId,
    userId: context.admin.id,
    module: "admin",
    action: "organization.suspended",
    recordId: organizationId,
    previousValue: before,
    newValue: { subscriptionStatus: "suspended" },
  });

  return { success: true };
}

export async function reactivateOrganizationAction(organizationId: string) {
  const context = await getAdminContext();

  if (!context) {
    return { error: "Not authorized." };
  }

  const [before] = await db
    .select({ subscriptionStatus: organizations.subscriptionStatus })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);

  if (!before) {
    return { error: "Organization not found." };
  }

  const nextStatus = "trial";

  await db
    .update(organizations)
    .set({ subscriptionStatus: nextStatus })
    .where(eq(organizations.id, organizationId));

  await logAudit({
    organizationId,
    userId: context.admin.id,
    module: "admin",
    action: "organization.reactivated",
    recordId: organizationId,
    previousValue: before,
    newValue: { subscriptionStatus: nextStatus },
  });

  return { success: true };
}
