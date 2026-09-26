import type { Metadata } from "next";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { AcceptInviteForm } from "@/components/accept-invite-form";
import { AuthShell } from "@/components/auth-shell";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getInvitationByToken } from "@/lib/invitations";

export const metadata: Metadata = {
  title: "Join a team | Aimify",
  robots: { index: false, follow: false },
};

export default async function AcceptInvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const invitation = token ? await getInvitationByToken(token) : null;

  if (!invitation || !token) {
    return (
      <AuthShell
        eyebrow="Team invitation"
        title="This invitation isn't valid"
        subtitle="The link is invalid, already used, revoked, or has expired. Ask the person who invited you to send a new one."
        switchText="Already have an account?"
        switchLabel="Sign in"
        switchHref="/signin"
      >
        <Link className="hero-primary" href="/">
          Back to Aimify
        </Link>
      </AuthShell>
    );
  }

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, invitation.email))
    .limit(1);

  const session = await auth();
  const signedInId = session?.user?.id ?? null;
  const mode = !existing
    ? "new"
    : signedInId === existing.id
      ? "existing-signed-in"
      : "existing-signed-out";

  return (
    <AuthShell
      eyebrow="Team invitation"
      title={`Join ${invitation.organizationName}`}
      subtitle={`${invitation.inviterName ?? "A teammate"} invited ${invitation.email} to join as ${invitation.role}.`}
      switchText="Not you?"
      switchLabel="Go to sign in"
      switchHref="/signin"
    >
      <AcceptInviteForm
        token={token}
        mode={mode}
        email={invitation.email}
        organizationName={invitation.organizationName}
      />
    </AuthShell>
  );
}
