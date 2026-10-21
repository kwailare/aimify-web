import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { memberships, users } from "@/db/schema";
import { guardApi } from "@/lib/api-context";
import { listPendingInvitations } from "@/lib/invitations";
import { getOrgPlan, getUsage, limitFor } from "@/lib/plans";
import { assignableRoles } from "@/lib/roles";

export async function GET(request: Request) {
  const context = await guardApi(request, "team.manage");

  if (context instanceof NextResponse) return context;

  const [members, invitations, plan, usage] = await Promise.all([
    db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: memberships.role,
        joinedAt: memberships.createdAt,
      })
      .from(memberships)
      .innerJoin(users, eq(memberships.userId, users.id))
      .where(eq(memberships.organizationId, context.organizationId))
      .orderBy(asc(memberships.createdAt)),
    listPendingInvitations(context.organizationId),
    getOrgPlan(context.organizationId),
    getUsage(context.organizationId),
  ]);

  return NextResponse.json({
    members,
    invitations,
    assignableRoles: assignableRoles(context.role),
    seats: {
      limit: limitFor(plan, "users"),
      used: usage.users + usage.pendingInvites,
    },
  });
}
