import { asc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { TeamManager } from "@/components/team-manager";
import { db } from "@/db";
import { memberships, users } from "@/db/schema";
import { listPendingInvitations } from "@/lib/invitations";
import { getOrgContext } from "@/lib/org";
import { assignableRoles, canManageTeam } from "@/lib/roles";

export default async function DashboardTeamPage() {
  const context = await getOrgContext();

  if (!context?.membership) {
    redirect("/signin");
  }

  const { organization, role } = context.membership;
  const canManage = canManageTeam(role);

  const [members, invitations] = await Promise.all([
    db
      .select({
        userId: users.id,
        name: users.name,
        email: users.email,
        phone: users.phone,
        role: memberships.role,
        joinedAt: memberships.createdAt,
      })
      .from(memberships)
      .innerJoin(users, eq(memberships.userId, users.id))
      .where(eq(memberships.organizationId, organization.id))
      .orderBy(asc(memberships.createdAt)),
    canManage ? listPendingInvitations(organization.id) : Promise.resolve([]),
  ]);

  return (
    <div className="dash-stack dash-stack--wide">
      <div>
        <p className="dash-page-eyebrow">Team</p>
        <h1 className="dash-page-title">Your team</h1>
        <p className="dash-page-subtitle">
          Everyone who can sign in to {organization.name} on the website and
          the desktop app.
          {canManage
            ? " Invite people by email and choose what they do."
            : " Only Owners and Administrators can change the team."}
        </p>
      </div>

      <TeamManager
        currentUserId={context.user.id}
        currentRole={role}
        canManage={canManage}
        assignable={assignableRoles(role)}
        members={members.map((member) => ({
          ...member,
          joinedAt: member.joinedAt.toISOString(),
        }))}
        invitations={invitations.map((invitation) => ({
          ...invitation,
          expiresAt: invitation.expiresAt.toISOString(),
          createdAt: invitation.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
