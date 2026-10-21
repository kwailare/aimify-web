import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { logAudit } from "@/lib/audit";
import {
  MAX_INVITES_PER_HOUR,
  MAX_PENDING_INVITES,
  countPendingInvitations,
  countRecentInvitations,
  createInvitation,
  sendInvitationEmail,
  userHasOrganization,
} from "@/lib/invitations";
import { checkPlanLimit } from "@/lib/plans";
import { assignableRoles, isRole } from "@/lib/roles";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type InviteResult =
  | { success: true; id: string; email: string; role: string; emailSent: boolean }
  | { success: false; error: string; code: string };

export async function inviteMember(entry: {
  organization: { id: string; name: string };
  inviter: { id: string; name: string; role: string };
  email: string;
  role: string;
}): Promise<InviteResult> {
  const email = entry.email.trim().toLowerCase();
  const { role } = entry;
  const organizationId = entry.organization.id;

  if (!EMAIL_PATTERN.test(email) || email.length > 254) {
    return { success: false, error: "Enter a valid email address.", code: "invalid_email" };
  }

  if (!isRole(role) || !assignableRoles(entry.inviter.role).includes(role)) {
    return {
      success: false,
      error: "You can't invite someone with that role.",
      code: "role_not_assignable",
    };
  }

  if ((await countPendingInvitations(organizationId)) >= MAX_PENDING_INVITES) {
    return {
      success: false,
      error: `You have ${MAX_PENDING_INVITES} pending invitations. Revoke some before sending more.`,
      code: "too_many_pending",
    };
  }

  if ((await countRecentInvitations(organizationId)) >= MAX_INVITES_PER_HOUR) {
    return {
      success: false,
      error: "Too many invitations sent in the last hour. Try again later.",
      code: "rate_limited",
    };
  }

  const seats = await checkPlanLimit(organizationId, "users");

  if (!seats.allowed) {
    return {
      success: false,
      error: `${seats.message} Remove a member or revoke an invitation, or ask the Aimify team about a larger plan.`,
      code: "plan_limit",
    };
  }

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existing && (await userHasOrganization(existing.id))) {
    return {
      success: false,
      error:
        "That person already belongs to an organization on Aimify, so they can't be invited.",
      code: "already_in_organization",
    };
  }

  const { id, token } = await createInvitation({
    organizationId,
    email,
    role,
    invitedBy: entry.inviter.id,
  });

  await logAudit({
    organizationId,
    userId: entry.inviter.id,
    module: "team",
    action: "team.invited",
    recordId: id,
    newValue: { email, role },
  });

  const emailSent = await sendInvitationEmail({
    to: email,
    token,
    organizationName: entry.organization.name,
    inviterName: entry.inviter.name,
    role,
  });

  return { success: true, id, email, role, emailSent };
}
