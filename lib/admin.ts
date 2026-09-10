import { count, desc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { adminUsers, memberships, organizations, users } from "@/db/schema";

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
    .where(eq(organizations.subscriptionStatus, "trial"));
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

export async function getAllOrganizations() {
  return db
    .select({
      id: organizations.id,
      name: organizations.name,
      industry: organizations.industry,
      subscriptionStatus: organizations.subscriptionStatus,
      trialEndsAt: organizations.trialEndsAt,
      createdAt: organizations.createdAt,
      memberCount: count(memberships.id),
    })
    .from(organizations)
    .leftJoin(memberships, eq(memberships.organizationId, organizations.id))
    .groupBy(organizations.id)
    .orderBy(desc(organizations.createdAt));
}
