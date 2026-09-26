"use server";

import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { hash } from "bcryptjs";
import { AuthError } from "next-auth";
import { auth, signIn } from "@/auth";
import { db } from "@/db";
import { memberships, users } from "@/db/schema";
import { logAudit } from "@/lib/audit";
import {
  claimInvitation,
  getInvitationByToken,
  releaseInvitation,
  userHasOrganization,
} from "@/lib/invitations";
import { validateNewPassword } from "@/lib/password-rules";
import { checkPlanLimit } from "@/lib/plans";
import { getClientIp, isRateLimited, recordLoginAttempt } from "@/lib/rate-limit";

const INVALID = "This invitation is invalid, already used, or has expired.";

async function guardAttempts() {
  const ip = getClientIp(await headers());
  const identifiers = [`invite-ip:${ip}`];

  if (await isRateLimited(identifiers)) {
    return { identifiers, limited: true as const };
  }

  return { identifiers, limited: false as const };
}

export async function acceptInviteAsNewUserAction(
  token: string,
  formData: FormData,
) {
  const attempts = await guardAttempts();

  if (attempts.limited) {
    return { error: "Too many attempts. Please try again in a few minutes." };
  }

  const invitation = await getInvitationByToken(token);

  if (!invitation) {
    await recordLoginAttempt(attempts.identifiers, false);
    return { error: INVALID };
  }

  const name = String(formData.get("name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!name || !phone || !password) {
    return { error: "Name, phone number and password are required." };
  }

  const passwordError = validateNewPassword(password);

  if (passwordError) {
    return { error: passwordError };
  }

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, invitation.email))
    .limit(1);

  if (existing) {
    return {
      error: "An account with this email already exists. Sign in to accept the invitation.",
    };
  }

  const seats = await checkPlanLimit(invitation.organizationId, "users", {
    excludePending: true,
  });

  if (!seats.allowed) {
    return {
      error: "This team has reached its plan limit. Ask the person who invited you to free up a seat.",
    };
  }

  if (!(await claimInvitation(invitation.id))) {
    await recordLoginAttempt(attempts.identifiers, false);
    return { error: INVALID };
  }

  let userId: string;

  try {
    const [created] = await db
      .insert(users)
      .values({
        name,
        phone,
        email: invitation.email,
        passwordHash: await hash(password, 10),
        emailVerifiedAt: new Date(),
      })
      .returning({ id: users.id });

    userId = created.id;

    await db.insert(memberships).values({
      userId,
      organizationId: invitation.organizationId,
      role: invitation.role,
    });
  } catch {
    await releaseInvitation(invitation.id);
    return { error: "We couldn't create your account. Please try again." };
  }

  await logAudit({
    organizationId: invitation.organizationId,
    userId,
    module: "team",
    action: "team.invite_accepted",
    recordId: invitation.id,
    newValue: { email: invitation.email, role: invitation.role },
  });

  try {
    await signIn("credentials", {
      email: invitation.email,
      password,
      redirect: false,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return { success: true as const, signedIn: false };
    }
    throw error;
  }

  return { success: true as const, signedIn: true };
}

export async function acceptInviteAsExistingUserAction(token: string) {
  const attempts = await guardAttempts();

  if (attempts.limited) {
    return { error: "Too many attempts. Please try again in a few minutes." };
  }

  const session = await auth();

  if (!session?.user?.id) {
    return { error: "Sign in first, then open the invitation link again." };
  }

  const invitation = await getInvitationByToken(token);

  if (!invitation) {
    await recordLoginAttempt(attempts.identifiers, false);
    return { error: INVALID };
  }

  const [user] = await db
    .select({ id: users.id, email: users.email, emailVerifiedAt: users.emailVerifiedAt })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  if (!user || user.email.toLowerCase() !== invitation.email) {
    return {
      error: `This invitation was sent to ${invitation.email}. Sign in with that account to accept it.`,
    };
  }

  if (await userHasOrganization(user.id)) {
    return { error: "Your account already belongs to an organization." };
  }

  const seats = await checkPlanLimit(invitation.organizationId, "users", {
    excludePending: true,
  });

  if (!seats.allowed) {
    return {
      error: "This team has reached its plan limit. Ask the person who invited you to free up a seat.",
    };
  }

  if (!(await claimInvitation(invitation.id))) {
    await recordLoginAttempt(attempts.identifiers, false);
    return { error: INVALID };
  }

  try {
    await db.insert(memberships).values({
      userId: user.id,
      organizationId: invitation.organizationId,
      role: invitation.role,
    });

    if (!user.emailVerifiedAt) {
      await db
        .update(users)
        .set({ emailVerifiedAt: new Date() })
        .where(eq(users.id, user.id));
    }
  } catch {
    await releaseInvitation(invitation.id);
    return { error: "We couldn't add you to the team. Please try again." };
  }

  await logAudit({
    organizationId: invitation.organizationId,
    userId: user.id,
    module: "team",
    action: "team.invite_accepted",
    recordId: invitation.id,
    newValue: { email: invitation.email, role: invitation.role },
  });

  return { success: true as const };
}
