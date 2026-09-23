import type { Metadata } from "next";
import { AuthShell } from "@/components/auth-shell";
import { ForgotPasswordForm } from "@/components/forgot-password-form";

export const metadata: Metadata = {
  title: "Reset your password | Aimify",
  description: "Request help getting back into your Aimify account.",
};

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      eyebrow="Account recovery"
      title="Reset your password"
      subtitle="Enter the email on your account and our team will reach out to help you regain access."
      switchText="Remembered it after all?"
      switchLabel="Back to sign in"
      switchHref="/signin"
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}
