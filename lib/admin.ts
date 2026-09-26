import { and, asc, count, desc, eq, gt, isNull, or, sql } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import {
  adminUsers,
  auditLogs,
  memberships,
  organizations,
  users,
} from "@/db/schema";

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
      createdAt: organizations.createdAt,
      warehouseCount: sql<number>`(select count(*)::int from "warehouses" as w where w."organizationId" = "organizations"."id")`,
      productCount: sql<number>`(select count(*)::int from "products" as p where p."organizationId" = "organizations"."id")`,
      movementCount: sql<number>`(select count(*)::int from "stock_movements" as m where m."organizationId" = "organizations"."id")`,
      lastActivityAt: sql<Date | null>`(select max(a."createdAt") from "audit_logs" as a where a."organizationId" = "organizations"."id")`.mapWith(
        auditLogs.createdAt,
      ),
    })
    .from(organizations)
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
