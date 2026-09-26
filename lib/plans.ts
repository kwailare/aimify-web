import { and, count, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import {
  memberships,
  organizations,
  plans,
  products,
  warehouses,
} from "@/db/schema";
import { countPendingInvitations } from "@/lib/invitations";

export type PlanLimits = {
  maxUsers: number | null;
  maxWarehouses: number | null;
  maxProducts: number | null;
};

export type OrgPlan = PlanLimits & {
  id: string | null;
  name: string;
  priceMonthly: number;
};

const FALLBACK_PLAN: OrgPlan = {
  id: null,
  name: "Full Access",
  priceMonthly: 25000,
  maxUsers: null,
  maxWarehouses: 1,
  maxProducts: null,
};

export type LimitKey = "users" | "warehouses" | "products";

const LIMIT_FIELD: Record<LimitKey, keyof PlanLimits> = {
  users: "maxUsers",
  warehouses: "maxWarehouses",
  products: "maxProducts",
};

const LIMIT_NOUN: Record<LimitKey, [string, string]> = {
  users: ["team member", "team members"],
  warehouses: ["active warehouse", "active warehouses"],
  products: ["active product", "active products"],
};

export async function getDefaultPlan(): Promise<OrgPlan> {
  const [row] = await db
    .select()
    .from(plans)
    .where(and(eq(plans.isDefault, true), eq(plans.isActive, true)))
    .limit(1);

  return row ? toOrgPlan(row) : FALLBACK_PLAN;
}

function toOrgPlan(row: typeof plans.$inferSelect): OrgPlan {
  return {
    id: row.id,
    name: row.name,
    priceMonthly: row.priceMonthly,
    maxUsers: row.maxUsers,
    maxWarehouses: row.maxWarehouses,
    maxProducts: row.maxProducts,
  };
}

export async function getOrgPlan(organizationId: string): Promise<OrgPlan> {
  const [row] = await db
    .select({ plan: plans })
    .from(organizations)
    .leftJoin(plans, eq(organizations.planId, plans.id))
    .where(eq(organizations.id, organizationId))
    .limit(1);

  if (row?.plan) return toOrgPlan(row.plan);

  return getDefaultPlan();
}

export async function getUsage(organizationId: string) {
  const [
    [memberRow],
    [warehouseRow],
    [productRow],
    pendingInvites,
  ] = await Promise.all([
    db
      .select({ value: count() })
      .from(memberships)
      .where(eq(memberships.organizationId, organizationId)),
    db
      .select({ value: count() })
      .from(warehouses)
      .where(
        and(
          eq(warehouses.organizationId, organizationId),
          eq(warehouses.status, "active"),
        ),
      ),
    db
      .select({ value: count() })
      .from(products)
      .where(
        and(
          eq(products.organizationId, organizationId),
          ne(products.status, "archived"),
        ),
      ),
    countPendingInvitations(organizationId),
  ]);

  return {
    users: memberRow?.value ?? 0,
    pendingInvites,
    warehouses: warehouseRow?.value ?? 0,
    products: productRow?.value ?? 0,
  };
}

export function limitFor(plan: PlanLimits, key: LimitKey) {
  return plan[LIMIT_FIELD[key]];
}

export function limitMessage(plan: OrgPlan, key: LimitKey) {
  const limit = limitFor(plan, key);
  const [one, many] = LIMIT_NOUN[key];

  return `Your ${plan.name} plan allows ${limit} ${limit === 1 ? one : many}.`;
}

export async function checkPlanLimit(
  organizationId: string,
  key: LimitKey,
  options: { excludePending?: boolean } = {},
) {
  const plan = await getOrgPlan(organizationId);
  const limit = limitFor(plan, key);

  if (limit === null) {
    return { allowed: true as const, plan };
  }

  const usage = await getUsage(organizationId);
  const used =
    key === "users"
      ? usage.users + (options.excludePending ? 0 : usage.pendingInvites)
      : usage[key];

  if (used >= limit) {
    return {
      allowed: false as const,
      plan,
      limit,
      used,
      message: limitMessage(plan, key),
    };
  }

  return { allowed: true as const, plan };
}

export async function countOrganizationsOnPlan(planId: string) {
  const [row] = await db
    .select({ value: count() })
    .from(organizations)
    .where(eq(organizations.planId, planId));

  return row?.value ?? 0;
}
