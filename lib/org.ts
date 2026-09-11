import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { memberships, organizations, users } from "@/db/schema";

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

  return {
    user,
    membership: row ? { role: row.role, organization: row.organization } : null,
  };
}

export async function getOrgContext() {
  const session = await auth();

  if (!session?.user?.id) {
    return null;
  }

  return getOrgContextForUser(session.user.id);
}
