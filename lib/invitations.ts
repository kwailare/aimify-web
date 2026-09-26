import { createHash, randomBytes } from "crypto";
import { and, count, desc, eq, gt, gte, isNull } from "drizzle-orm";
import { db } from "@/db";
import { invitations, memberships, organizations, users } from "@/db/schema";
import { sendEmail } from "@/lib/email";
import { SITE_URL } from "@/lib/site";

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const MAX_PENDING_INVITES = 25;
export const MAX_INVITES_PER_HOUR = 20;

export function hashInviteToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

const pending = (organizationId: string) =>
  and(
    eq(invitations.organizationId, organizationId),
    isNull(invitations.acceptedAt),
    isNull(invitations.revokedAt),
    gt(invitations.expiresAt, new Date()),
  );

export async function listPendingInvitations(organizationId: string) {
  return db
    .select({
      id: invitations.id,
      email: invitations.email,
      role: invitations.role,
      expiresAt: invitations.expiresAt,
      createdAt: invitations.createdAt,
      invitedByName: users.name,
    })
    .from(invitations)
    .leftJoin(users, eq(invitations.invitedBy, users.id))
    .where(pending(organizationId))
    .orderBy(desc(invitations.createdAt));
}

export async function countPendingInvitations(organizationId: string) {
  const [row] = await db
    .select({ value: count() })
    .from(invitations)
    .where(pending(organizationId));

  return row?.value ?? 0;
}

export async function countRecentInvitations(organizationId: string) {
  const [row] = await db
    .select({ value: count() })
    .from(invitations)
    .where(
      and(
        eq(invitations.organizationId, organizationId),
        gte(invitations.createdAt, new Date(Date.now() - 60 * 60 * 1000)),
      ),
    );

  return row?.value ?? 0;
}

export async function createInvitation(entry: {
  organizationId: string;
  email: string;
  role: string;
  invitedBy: string;
}) {
  await db
    .update(invitations)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(invitations.organizationId, entry.organizationId),
        eq(invitations.email, entry.email),
        isNull(invitations.acceptedAt),
        isNull(invitations.revokedAt),
      ),
    );

  const token = randomBytes(32).toString("base64url");

  const [created] = await db
    .insert(invitations)
    .values({
      organizationId: entry.organizationId,
      email: entry.email,
      role: entry.role,
      invitedBy: entry.invitedBy,
      tokenHash: hashInviteToken(token),
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
    })
    .returning({ id: invitations.id });

  return { id: created.id, token };
}

export async function getInvitationByToken(token: string) {
  if (!token) return null;

  const [row] = await db
    .select({
      id: invitations.id,
      email: invitations.email,
      role: invitations.role,
      organizationId: invitations.organizationId,
      organizationName: organizations.name,
      inviterName: users.name,
      acceptedAt: invitations.acceptedAt,
      revokedAt: invitations.revokedAt,
      expiresAt: invitations.expiresAt,
    })
    .from(invitations)
    .innerJoin(organizations, eq(invitations.organizationId, organizations.id))
    .leftJoin(users, eq(invitations.invitedBy, users.id))
    .where(eq(invitations.tokenHash, hashInviteToken(token)))
    .limit(1);

  if (
    !row ||
    row.acceptedAt ||
    row.revokedAt ||
    row.expiresAt <= new Date()
  ) {
    return null;
  }

  return row;
}

export async function claimInvitation(invitationId: string) {
  const [claimed] = await db
    .update(invitations)
    .set({ acceptedAt: new Date() })
    .where(
      and(
        eq(invitations.id, invitationId),
        isNull(invitations.acceptedAt),
        isNull(invitations.revokedAt),
        gt(invitations.expiresAt, new Date()),
      ),
    )
    .returning({ id: invitations.id });

  return Boolean(claimed);
}

export async function releaseInvitation(invitationId: string) {
  await db
    .update(invitations)
    .set({ acceptedAt: null })
    .where(eq(invitations.id, invitationId));
}

export async function userHasOrganization(userId: string) {
  const [row] = await db
    .select({ id: memberships.id })
    .from(memberships)
    .where(eq(memberships.userId, userId))
    .limit(1);

  return Boolean(row);
}

export async function sendInvitationEmail(entry: {
  to: string;
  token: string;
  organizationName: string;
  inviterName: string;
  role: string;
}) {
  const link = `${SITE_URL}/accept-invite?token=${entry.token}`;

  return sendEmail({
    to: entry.to,
    subject: `${entry.inviterName} invited you to ${entry.organizationName} on Aimify`,
    text: `${entry.inviterName} invited you to join ${entry.organizationName} on Aimify as ${entry.role}.\n\nAccept the invitation here:\n${link}\n\nThe link works for 7 days. If you weren't expecting this, you can ignore this email.`,
    html: `<p>${escapeHtml(entry.inviterName)} invited you to join <strong>${escapeHtml(entry.organizationName)}</strong> on Aimify as ${escapeHtml(entry.role)}.</p><p><a href="${link}">Accept the invitation</a>. The link works for 7 days.</p><p>If you weren't expecting this, you can ignore this email.</p>`,
  });
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
