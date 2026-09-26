"use server";

import { and, count, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { organizations, plans } from "@/db/schema";
import { getAdminContext } from "@/lib/admin";
import { logAudit } from "@/lib/audit";

export type PlanInput = {
  name: string;
  description: string;
  priceMonthly: number;
  maxUsers: number | null;
  maxWarehouses: number | null;
  maxProducts: number | null;
};

const MAX_PRICE = 100_000_000;
const MAX_LIMIT = 10_000_000;

function parseLimit(value: unknown, label: string) {
  if (value === null || value === undefined || value === "") {
    return { value: null };
  }

  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > MAX_LIMIT
  ) {
    return { error: `${label} must be a whole number of at least 1, or left empty for unlimited.` };
  }

  return { value };
}

function parsePlan(input: PlanInput) {
  const name = String(input?.name ?? "").trim();
  const description = String(input?.description ?? "").trim();

  if (!name || name.length > 60) {
    return { error: "Plan name is required and must be at most 60 characters." };
  }

  if (description.length > 200) {
    return { error: "The description must be at most 200 characters." };
  }

  const price = input?.priceMonthly;

  if (typeof price !== "number" || !Number.isFinite(price) || price < 0 || price > MAX_PRICE) {
    return { error: "Enter a monthly price of zero or more." };
  }

  const users = parseLimit(input.maxUsers, "Users");
  if ("error" in users) return { error: users.error };
  const warehouses = parseLimit(input.maxWarehouses, "Warehouses");
  if ("error" in warehouses) return { error: warehouses.error };
  const products = parseLimit(input.maxProducts, "Products");
  if ("error" in products) return { error: products.error };

  return {
    data: {
      name,
      description: description || null,
      priceMonthly: price,
      maxUsers: users.value,
      maxWarehouses: warehouses.value,
      maxProducts: products.value,
    },
  };
}

export async function createPlanAction(input: PlanInput) {
  const context = await getAdminContext();

  if (!context) return { error: "Not authorized." };

  const parsed = parsePlan(input);

  if ("error" in parsed) return { error: parsed.error };

  const [created] = await db.insert(plans).values(parsed.data).returning();

  await logAudit({
    userId: context.admin.id,
    module: "admin",
    action: "admin.plan_created",
    recordId: created.id,
    newValue: parsed.data,
  });

  return { success: true };
}

export async function updatePlanAction(planId: string, input: PlanInput) {
  const context = await getAdminContext();

  if (!context) return { error: "Not authorized." };

  const parsed = parsePlan(input);

  if ("error" in parsed) return { error: parsed.error };

  const [before] = await db.select().from(plans).where(eq(plans.id, planId)).limit(1);

  if (!before) return { error: "Plan not found." };

  await db.update(plans).set(parsed.data).where(eq(plans.id, planId));

  await logAudit({
    userId: context.admin.id,
    module: "admin",
    action: "admin.plan_updated",
    recordId: planId,
    previousValue: {
      name: before.name,
      description: before.description,
      priceMonthly: before.priceMonthly,
      maxUsers: before.maxUsers,
      maxWarehouses: before.maxWarehouses,
      maxProducts: before.maxProducts,
    },
    newValue: parsed.data,
  });

  return { success: true };
}

export async function setDefaultPlanAction(planId: string) {
  const context = await getAdminContext();

  if (!context) return { error: "Not authorized." };

  const [plan] = await db.select().from(plans).where(eq(plans.id, planId)).limit(1);

  if (!plan) return { error: "Plan not found." };
  if (!plan.isActive) return { error: "Activate this plan before making it the default." };

  await db.update(plans).set({ isDefault: false }).where(ne(plans.id, planId));
  await db.update(plans).set({ isDefault: true }).where(eq(plans.id, planId));

  await logAudit({
    userId: context.admin.id,
    module: "admin",
    action: "admin.plan_default_set",
    recordId: planId,
    newValue: { name: plan.name },
  });

  return { success: true };
}

export async function setPlanActiveAction(planId: string, active: boolean) {
  const context = await getAdminContext();

  if (!context) return { error: "Not authorized." };

  const [plan] = await db.select().from(plans).where(eq(plans.id, planId)).limit(1);

  if (!plan) return { error: "Plan not found." };

  if (!active) {
    if (plan.isDefault) {
      return { error: "Make another plan the default before deactivating this one." };
    }

    const [inUse] = await db
      .select({ value: count() })
      .from(organizations)
      .where(eq(organizations.planId, planId));

    if ((inUse?.value ?? 0) > 0) {
      return { error: "Move the organizations on this plan to another plan first." };
    }
  }

  await db.update(plans).set({ isActive: active }).where(eq(plans.id, planId));

  await logAudit({
    userId: context.admin.id,
    module: "admin",
    action: active ? "admin.plan_activated" : "admin.plan_deactivated",
    recordId: planId,
    newValue: { name: plan.name },
  });

  return { success: true };
}

export async function assignOrganizationPlanAction(
  organizationId: string,
  planId: string,
) {
  const context = await getAdminContext();

  if (!context) return { error: "Not authorized." };

  const [plan] = await db
    .select()
    .from(plans)
    .where(and(eq(plans.id, planId), eq(plans.isActive, true)))
    .limit(1);

  if (!plan) return { error: "Choose an active plan." };

  const [before] = await db
    .select({ planId: organizations.planId })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);

  if (!before) return { error: "Organization not found." };

  if (before.planId === planId) return { success: true };

  await db
    .update(organizations)
    .set({ planId })
    .where(eq(organizations.id, organizationId));

  await logAudit({
    organizationId,
    userId: context.admin.id,
    module: "admin",
    action: "admin.plan_assigned",
    recordId: organizationId,
    previousValue: { planId: before.planId },
    newValue: { planId, name: plan.name },
  });

  return { success: true };
}
