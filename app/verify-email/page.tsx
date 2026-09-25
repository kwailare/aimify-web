import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AuthShell } from "@/components/auth-shell";
import { VerifyEmailPanel } from "@/components/verify-email-panel";
import { db } from "@/db";
import { users } from "@/db/schema";

export const metadata: Metadata = {
  title: "Confirm your email | Aimify",
  robots: { index: false, follow: false },
};

export default async function VerifyEmailPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/signin");
  }

  const [user] = await db
    .select({ email: users.email, emailVerifiedAt: users.emailVerifiedAt })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  if (!user) {
    redirect("/signin");
  }

  if (user.emailVerifiedAt) {
    redirect("/dashboard");
  }

  return (
    <AuthShell
      eyebrow="One more step"
      title="Check your email"
      subtitle={`We sent a confirmation link to ${user.email}. Open it to finish setting up your account.`}
      switchText="Wrong address or no email?"
      switchLabel="Contact support"
      switchHref="mailto:support@aimify.app"
    >
      <VerifyEmailPanel />
    </AuthShell>
  );
}
