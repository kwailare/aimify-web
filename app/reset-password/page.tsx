import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { ResetPasswordForm } from "@/components/reset-password-form";
import { isResetTokenValid } from "@/lib/password-reset";

export const metadata: Metadata = {
  title: "Choose a new password | Aimify",
  robots: { index: false, follow: false },
};

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const isValid = token ? await isResetTokenValid(token) : false;

  return (
    <AuthShell
      eyebrow="Account recovery"
      title="Choose a new password"
      subtitle={
        isValid
          ? "Pick a password you haven't used elsewhere. It needs at least 8 characters."
          : "This reset link is invalid or has expired."
      }
      switchText="Remembered it after all?"
      switchLabel="Back to sign in"
      switchHref="/signin"
    >
      {isValid && token ? (
        <ResetPasswordForm token={token} />
      ) : (
        <Link className="hero-primary" href="/forgot-password">
          Request a new link
        </Link>
      )}
    </AuthShell>
  );
}
