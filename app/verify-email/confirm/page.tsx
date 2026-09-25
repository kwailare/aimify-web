import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { ConfirmEmailForm } from "@/components/confirm-email-form";
import { isVerificationTokenValid } from "@/lib/email-verification";

export const metadata: Metadata = {
  title: "Confirm your email | Aimify",
  robots: { index: false, follow: false },
};

export default async function ConfirmEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const isValid = token ? await isVerificationTokenValid(token) : false;

  return (
    <AuthShell
      eyebrow="Email confirmation"
      title={isValid ? "Confirm your email" : "This link isn't valid"}
      subtitle={
        isValid
          ? "One click and your email address is confirmed."
          : "The link is invalid, already used, or has expired. Sign in to get a new one."
      }
      switchText="Already confirmed?"
      switchLabel="Sign in"
      switchHref="/signin"
    >
      {isValid && token ? (
        <ConfirmEmailForm token={token} />
      ) : (
        <Link className="hero-primary" href="/verify-email">
          Get a new link
        </Link>
      )}
    </AuthShell>
  );
}
