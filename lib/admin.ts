import { and, asc, count, desc, eq, gt, gte, isNull, lt, or, sql } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import {
  adminUsers,
  auditLogs,
  memberships,
  organizations,
  plans,
  products,
  stockMovements,
  users,
  warehouses,
} from "@/db/schema";
import { effectiveStatus } from "@/lib/subscription";
import { getTicketCounts } from "@/lib/support";

export async function getAdminContext() {
  const session = await auth();

  if (!session?.user?.id) {
    return null;
  }

  const [row] = await db
    .select({ user: users })
    .from(adminUsers)
    .innerJoin(users, eq(adminUsers.userId, users.id))
    .where(eq(adminUsers.userId, session.user.id))
    .limit(1);

  if (!row) {
    return null;
  }

  return { admin: row.user };
}

export async function getPlatformStats() {
  const [orgCount] = await db.select({ value: count() }).from(organizations);
  const [userCount] = await db.select({ value: count() }).from(users);
  const [trialCount] = await db
    .select({ value: count() })
    .from(organizations)
    .where(
      and(
        eq(organizations.subscriptionStatus, "trial"),
        or(isNull(organizations.trialEndsAt), gt(organizations.trialEndsAt, new Date())),
      ),
    );
  const [suspendedCount] = await db
    .select({ value: count() })
    .from(organizations)
    .where(eq(organizations.subscriptionStatus, "suspended"));

  return {
    totalOrganizations: orgCount.value,
    totalUsers: userCount.value,
    trialOrganizations: trialCount.value,
    suspendedOrganizations: suspendedCount.value,
  };
}

export type AdminOrganization = Awaited<
  ReturnType<typeof getAllOrganizations>
>[number];

export async function getAllOrganizations() {
  const rows = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      industry: organizations.industry,
      currency: organizations.currency,
      logoUrl: organizations.logoUrl,
      registrationNumber: organizations.registrationNumber,
      address: organizations.address,
      phone: organizations.phone,
      email: organizations.email,
      taxName: organizations.taxName,
      taxRate: organizations.taxRate,
      timezone: organizations.timezone,
      dateFormat: organizations.dateFormat,
      subscriptionStatus: organizations.subscriptionStatus,
      trialEndsAt: organizations.trialEndsAt,
      planId: organizations.planId,
      planName: plans.name,
      createdAt: organizations.createdAt,
      warehouseCount: sql<number>`(select count(*)::int from "warehouses" as w where w."organizationId" = "organizations"."id")`,
      productCount: sql<number>`(select count(*)::int from "products" as p where p."organizationId" = "organizations"."id")`,
      movementCount: sql<number>`(select count(*)::int from "stock_movements" as m where m."organizationId" = "organizations"."id")`,
      lastActivityAt: sql<Date | null>`(select max(a."createdAt") from "audit_logs" as a where a."organizationId" = "organizations"."id")`.mapWith(
        auditLogs.createdAt,
      ),
    })
    .from(organizations)
    .leftJoin(plans, eq(organizations.planId, plans.id))
    .orderBy(desc(organizations.createdAt));

  const memberRows = await db
    .select({
      organizationId: memberships.organizationId,
      userId: users.id,
      name: users.name,
      email: users.email,
      phone: users.phone,
      role: memberships.role,
      emailVerifiedAt: users.emailVerifiedAt,
      joinedAt: memberships.createdAt,
    })
    .from(memberships)
    .innerJoin(users, eq(memberships.userId, users.id))
    .orderBy(asc(memberships.createdAt));

  const membersByOrg = new Map<string, typeof memberRows>();

  for (const member of memberRows) {
    const list = membersByOrg.get(member.organizationId) ?? [];
    list.push(member);
    membersByOrg.set(member.organizationId, list);
  }

  return rows.map((row) => {
    const members = membersByOrg.get(row.id) ?? [];

    return {
      ...row,
      members,
      memberCount: members.length,
      owner: members[0] ?? null,
    };
  });
}

export type AdminUser = Awaited<ReturnType<typeof getAllUsers>>[number];

export async function getAllUsers() {
  return db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      phone: users.phone,
      emailVerifiedAt: users.emailVerifiedAt,
      twoFactorEnabledAt: users.twoFactorEnabledAt,
      createdAt: users.createdAt,
      role: memberships.role,
      organizationId: organizations.id,
      organizationName: organizations.name,
      organizationStatus: organizations.subscriptionStatus,
      organizationTrialEndsAt: organizations.trialEndsAt,
      isAdmin: adminUsers.id,
      lastSignInAt: sql<Date | null>`(select max(a."createdAt") from "audit_logs" as a where a."userId" = "users"."id" and a."action" = 'user.signed_in')`.mapWith(
        auditLogs.createdAt,
      ),
      signInCount: sql<number>`(select count(*)::int from "audit_logs" as a where a."userId" = "users"."id" and a."action" = 'user.signed_in')`,
    })
    .from(users)
    .leftJoin(memberships, eq(memberships.userId, users.id))
    .leftJoin(organizations, eq(memberships.organizationId, organizations.id))
    .leftJoin(adminUsers, eq(adminUsers.userId, users.id))
    .orderBy(desc(users.createdAt));
}

const DAY = 24 * 60 * 60 * 1000;
const MONTHLY_PRICE_NGN = 25000;
const TREND_DAYS = 14;

function dayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

export async function getOverviewData() {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * DAY);
  const monthAgo = new Date(now.getTime() - 30 * DAY);
  const trendStart = new Date(now.getTime() - (TREND_DAYS - 1) * DAY);
  trendStart.setUTCHours(0, 0, 0, 0);
  const weekAhead = new Date(now.getTime() + 7 * DAY);
  const dayAgo = new Date(now.getTime() - DAY);

  const [
    orgRows,
    [userTotal],
    [unverified],
    [staleUnverified],
    [orgsWeek],
    [orgsMonth],
    [usersWeek],
  ] = await Promise.all([
    db
      .select({
        id: organizations.id,
        name: organizations.name,
        status: organizations.subscriptionStatus,
        trialEndsAt: organizations.trialEndsAt,
        createdAt: organizations.createdAt,
        price: plans.priceMonthly,
      })
      .from(organizations)
      .leftJoin(plans, eq(organizations.planId, plans.id)),
    db.select({ value: count() }).from(users),
    db.select({ value: count() }).from(users).where(isNull(users.emailVerifiedAt)),
    db
      .select({ value: count() })
      .from(users)
      .where(and(isNull(users.emailVerifiedAt), lt(users.createdAt, dayAgo))),
    db.select({ value: count() }).from(organizations).where(gte(organizations.createdAt, weekAgo)),
    db.select({ value: count() }).from(organizations).where(gte(organizations.createdAt, monthAgo)),
    db.select({ value: count() }).from(users).where(gte(users.createdAt, weekAgo)),
  ]);

  const [
    [usersMonth],
    [warehouseTotal],
    [productTotal],
    [movementTotal],
    [auditTotal],
    [signupsToday],
  ] = await Promise.all([
    db.select({ value: count() }).from(users).where(gte(users.createdAt, monthAgo)),
    db.select({ value: count() }).from(warehouses),
    db.select({ value: count() }).from(products),
    db.select({ value: count() }).from(stockMovements),
    db.select({ value: count() }).from(auditLogs),
    db.select({ value: count() }).from(users).where(gte(users.createdAt, dayAgo)),
  ]);

  const [
    recentSignups,
    recentActivity,
    userTrendRows,
    orgTrendRows,
    activeTodayRows,
    newestUsers,
    activeOrgRows,
  ] = await Promise.all([
    db
      .select({
        id: organizations.id,
        name: organizations.name,
        industry: organizations.industry,
        status: organizations.subscriptionStatus,
        trialEndsAt: organizations.trialEndsAt,
        createdAt: organizations.createdAt,
      })
      .from(organizations)
      .orderBy(desc(organizations.createdAt))
      .limit(8),
    db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        previousValue: auditLogs.previousValue,
        newValue: auditLogs.newValue,
        createdAt: auditLogs.createdAt,
        actorName: users.name,
        organizationName: organizations.name,
      })
      .from(auditLogs)
      .leftJoin(users, eq(auditLogs.userId, users.id))
      .leftJoin(organizations, eq(auditLogs.organizationId, organizations.id))
      .orderBy(desc(auditLogs.createdAt))
      .limit(8),
    db.select({ createdAt: users.createdAt }).from(users).where(gte(users.createdAt, trendStart)),
    db
      .select({ createdAt: organizations.createdAt })
      .from(organizations)
      .where(gte(organizations.createdAt, trendStart)),
    db
      .selectDistinct({ userId: auditLogs.userId })
      .from(auditLogs)
      .where(and(eq(auditLogs.action, "user.signed_in"), gte(auditLogs.createdAt, dayAgo))),
    db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        emailVerifiedAt: users.emailVerifiedAt,
        createdAt: users.createdAt,
        organizationName: organizations.name,
      })
      .from(users)
      .leftJoin(memberships, eq(memberships.userId, users.id))
      .leftJoin(organizations, eq(memberships.organizationId, organizations.id))
      .orderBy(desc(users.createdAt))
      .limit(8),
    db
      .select({
        id: organizations.id,
        name: organizations.name,
        movements: count(),
      })
      .from(auditLogs)
      .innerJoin(organizations, eq(auditLogs.organizationId, organizations.id))
      .where(gte(auditLogs.createdAt, monthAgo))
      .groupBy(organizations.id, organizations.name)
      .orderBy(desc(count()))
      .limit(5),
  ]);

  const statusCounts: Record<string, number> = {};
  const endingSoon: { id: string; name: string; trialEndsAt: Date }[] = [];
  const expired: { id: string; name: string; trialEndsAt: Date | null }[] = [];

  let estimatedMonthlyRevenue = 0;

  for (const org of orgRows) {
    const status = effectiveStatus(org.status, org.trialEndsAt);
    statusCounts[status] = (statusCounts[status] ?? 0) + 1;

    if (status === "active") {
      estimatedMonthlyRevenue += org.price ?? MONTHLY_PRICE_NGN;
    }

    if (status === "trial" && org.trialEndsAt && org.trialEndsAt <= weekAhead) {
      endingSoon.push({ id: org.id, name: org.name, trialEndsAt: org.trialEndsAt });
    }

    if (status === "expired") {
      expired.push({ id: org.id, name: org.name, trialEndsAt: org.trialEndsAt });
    }
  }

  endingSoon.sort((a, b) => a.trialEndsAt.getTime() - b.trialEndsAt.getTime());

  const trend: { key: string; users: number; organizations: number }[] = [];
  const trendIndex = new Map<string, number>();

  for (let i = 0; i < TREND_DAYS; i++) {
    const key = dayKey(new Date(trendStart.getTime() + i * DAY));
    trendIndex.set(key, trend.length);
    trend.push({ key, users: 0, organizations: 0 });
  }

  for (const row of userTrendRows) {
    const i = trendIndex.get(dayKey(row.createdAt));
    if (i !== undefined) trend[i].users += 1;
  }

  for (const row of orgTrendRows) {
    const i = trendIndex.get(dayKey(row.createdAt));
    if (i !== undefined) trend[i].organizations += 1;
  }

  const ticketCounts = await getTicketCounts();
  const activeCount = statusCounts.active ?? 0;
  const pastDue = statusCounts.past_due ?? 0;

  return {
    totals: {
      organizations: orgRows.length,
      users: userTotal.value,
      unverified: unverified.value,
      staleUnverified: staleUnverified.value,
      warehouses: warehouseTotal.value,
      products: productTotal.value,
      movements: movementTotal.value,
      auditEntries: auditTotal.value,
      signedInToday: activeTodayRows.filter((row) => row.userId).length,
    },
    growth: {
      orgsWeek: orgsWeek.value,
      orgsMonth: orgsMonth.value,
      usersWeek: usersWeek.value,
      usersMonth: usersMonth.value,
      usersToday: signupsToday.value,
    },
    statusCounts,
    ticketCounts,
    payingOrganizations: activeCount,
    pastDueOrganizations: pastDue,
    estimatedMonthlyRevenue,
    endingSoon,
    expired: expired.slice(0, 5),
    expiredCount: expired.length,
    trend,
    recentSignups,
    recentActivity,
    newestUsers,
    activeOrgs: activeOrgRows,
  };
}

export type AdminPlan = Awaited<ReturnType<typeof getAdminPlans>>[number];

export async function getAdminPlans() {
  return db
    .select({
      id: plans.id,
      name: plans.name,
      description: plans.description,
      priceMonthly: plans.priceMonthly,
      maxUsers: plans.maxUsers,
      maxWarehouses: plans.maxWarehouses,
      maxProducts: plans.maxProducts,
      isDefault: plans.isDefault,
      isActive: plans.isActive,
      createdAt: plans.createdAt,
      organizationCount: sql<number>`(select count(*)::int from "organizations" as o where o."planId" = "plans"."id")`,
      payingCount: sql<number>`(select count(*)::int from "organizations" as o where o."planId" = "plans"."id" and o."subscriptionStatus" = 'active')`,
    })
    .from(plans)
    .orderBy(desc(plans.isDefault), asc(plans.priceMonthly));
}
