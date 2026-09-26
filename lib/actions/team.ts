"use server";

import { and, count, eq } from "drizzle-orm";
import { db } from "@/db";
import { invitations, memberships, users } from "@/db/schema";
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
import { getOrgContext } from "@/lib/org";
import { checkPlanLimit } from "@/lib/plans";
import {
  assignableRoles,
  canChangeMember,
  canManageTeam,
  isRole,
} from "@/lib/roles";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function getManager() {
  const context = await getOrgContext();

  if (!context?.membership || !context.user.emailVerifiedAt) {
    return null;
  }

  const { organization, role } = context.membership;

  if (!canManageTeam(role) || organization.subscriptionStatus === "suspended") {
    return null;
  }

  return { user: context.user, organization, role };
}

export async function inviteMemberAction(rawEmail: string, role: string) {
  const manager = await getManager();

  if (!manager) {
    return { error: "You don't have permission to manage the team." };
  }

  const email = rawEmail.trim().toLowerCase();

  if (!EMAIL_PATTERN.test(email) || email.length > 254) {
    return { error: "Enter a valid email address." };
  }

  if (!isRole(role) || !assignableRoles(manager.role).includes(role)) {
    return { error: "You can't invite someone with that role." };
  }

  const organizationId = manager.organization.id;

  if ((await countPendingInvitations(organizationId)) >= MAX_PENDING_INVITES) {
    return {
      error: `You have ${MAX_PENDING_INVITES} pending invitations. Revoke some before sending more.`,
    };
  }

  if ((await countRecentInvitations(organizationId)) >= MAX_INVITES_PER_HOUR) {
    return { error: "Too many invitations sent in the last hour. Try again later." };
  }

  const seats = await checkPlanLimit(organizationId, "users");

  if (!seats.allowed) {
    return {
      error: `${seats.message} Remove a member or revoke an invitation, or ask the Aimify team about a larger plan.`,
    };
  }

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existing && (await userHasOrganization(existing.id))) {
    return {
      error:
        "That person already belongs to an organization on Aimify, so they can't be invited.",
    };
  }

  const { id, token } = await createInvitation({
    organizationId,
    email,
    role,
    invitedBy: manager.user.id,
  });

  await logAudit({
    organizationId,
    userId: manager.user.id,
    module: "team",
    action: "team.invited",
    recordId: id,
    newValue: { email, role },
  });

  const sent = await sendInvitationEmail({
    to: email,
    token,
    organizationName: manager.organization.name,
    inviterName: manager.user.name,
    role,
  });

  if (!sent) {
    return {
      error:
        "The invitation was saved but the email couldn't be sent. Use Resend to try again.",
    };
  }

  return { success: true };
}

export async function resendInvitationAction(invitationId: string) {
  const manager = await getManager();

  if (!manager) {
    return { error: "You don't have permission to manage the team." };
  }

  const [invitation] = await db
    .select()
    .from(invitations)
    .where(
      and(
        eq(invitations.id, invitationId),
        eq(invitations.organizationId, manager.organization.id),
      ),
    )
    .limit(1);

  if (!invitation || invitation.acceptedAt || invitation.revokedAt) {
    return { error: "That invitation is no longer pending." };
  }

  if (!assignableRoles(manager.role).includes(invitation.role as never)) {
    return { error: "You can't manage invitations for that role." };
  }

  if ((await countRecentInvitations(manager.organization.id)) >= MAX_INVITES_PER_HOUR) {
    return { error: "Too many invitations sent in the last hour. Try again later." };
  }

  const { id, token } = await createInvitation({
    organizationId: manager.organization.id,
    email: invitation.email,
    role: invitation.role,
    invitedBy: manager.user.id,
  });

  await logAudit({
    organizationId: manager.organization.id,
    userId: manager.user.id,
    module: "team",
    action: "team.invite_resent",
    recordId: id,
    newValue: { email: invitation.email, role: invitation.role },
  });

  const sent = await sendInvitationEmail({
    to: invitation.email,
    token,
    organizationName: manager.organization.name,
    inviterName: manager.user.name,
    role: invitation.role,
  });

  return sent
    ? { success: true }
    : { error: "The email couldn't be sent. Try again in a moment." };
}

export async function revokeInvitationAction(invitationId: string) {
  const manager = await getManager();

  if (!manager) {
    return { error: "You don't have permission to manage the team." };
  }

  const [invitation] = await db
    .select()
    .from(invitations)
    .where(
      and(
        eq(invitations.id, invitationId),
        eq(invitations.organizationId, manager.organization.id),
      ),
    )
    .limit(1);

  if (!invitation || invitation.acceptedAt || invitation.revokedAt) {
    return { error: "That invitation is no longer pending." };
  }

  if (!assignableRoles(manager.role).includes(invitation.role as never)) {
    return { error: "You can't manage invitations for that role." };
  }

  await db
    .update(invitations)
    .set({ revokedAt: new Date() })
    .where(eq(invitations.id, invitation.id));

  await logAudit({
    organizationId: manager.organization.id,
    userId: manager.user.id,
    module: "team",
    action: "team.invite_revoked",
    recordId: invitation.id,
    previousValue: { email: invitation.email, role: invitation.role },
  });

  return { success: true };
}

async function countOwners(organizationId: string) {
  const [row] = await db
    .select({ value: count() })
    .from(memberships)
    .where(
      and(
        eq(memberships.organizationId, organizationId),
        eq(memberships.role, "Owner"),
      ),
    );

  return row?.value ?? 0;
}

async function getMember(organizationId: string, userId: string) {
  const [member] = await db
    .select({
      id: memberships.id,
      userId: memberships.userId,
      role: memberships.role,
      name: users.name,
      email: users.email,
    })
    .from(memberships)
    .innerJoin(users, eq(memberships.userId, users.id))
    .where(
      and(
        eq(memberships.organizationId, organizationId),
        eq(memberships.userId, userId),
      ),
    )
    .limit(1);

  return member ?? null;
}

export async function changeMemberRoleAction(userId: string, role: string) {
  const manager = await getManager();

  if (!manager) {
    return { error: "You don't have permission to manage the team." };
  }

  if (userId === manager.user.id) {
    return { error: "You can't change your own role." };
  }

  const member = await getMember(manager.organization.id, userId);

  if (!member) {
    return { error: "That person isn't on your team." };
  }

  if (!isRole(role) || !assignableRoles(manager.role).includes(role)) {
    return { error: "You can't assign that role." };
  }

  if (!canChangeMember(manager.role, member.role)) {
    return { error: "You can't change this person's role." };
  }

  if (member.role === role) {
    return { success: true };
  }

  if (member.role === "Owner" && (await countOwners(manager.organization.id)) <= 1) {
    return { error: "An organization needs at least one Owner." };
  }

  await db
    .update(memberships)
    .set({ role })
    .where(eq(memberships.id, member.id));

  await logAudit({
    organizationId: manager.organization.id,
    userId: manager.user.id,
    module: "team",
    action: "team.role_changed",
    recordId: member.userId,
    previousValue: { email: member.email, role: member.role },
    newValue: { email: member.email, role },
  });

  return { success: true };
}

export async function removeMemberAction(userId: string) {
  const manager = await getManager();

  if (!manager) {
    return { error: "You don't have permission to manage the team." };
  }

  if (userId === manager.user.id) {
    return { error: "You can't remove yourself from the team." };
  }

  const member = await getMember(manager.organization.id, userId);

  if (!member) {
    return { error: "That person isn't on your team." };
  }

  if (!canChangeMember(manager.role, member.role)) {
    return { error: "You can't remove this person." };
  }

  if (member.role === "Owner" && (await countOwners(manager.organization.id)) <= 1) {
    return { error: "An organization needs at least one Owner." };
  }

  await db.delete(memberships).where(eq(memberships.id, member.id));

  await logAudit({
    organizationId: manager.organization.id,
    userId: manager.user.id,
    module: "team",
    action: "team.member_removed",
    recordId: member.userId,
    previousValue: { email: member.email, role: member.role },
  });

  return { success: true };
}
