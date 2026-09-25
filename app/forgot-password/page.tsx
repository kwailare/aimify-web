import type { Metadata } from "next";
import { AuthShell } from "@/components/auth-shell";
import { ForgotPasswordForm } from "@/components/forgot-password-form";

export const metadata: Metadata = {
  title: "Reset your password | Aimify",
  description: "Get a link to reset your Aimify password.",
};

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      eyebrow="Account recovery"
      title="Reset your password"
      subtitle="Enter the email on your account and we'll send you a link to choose a new password."
      switchText="Remembered it after all?"
      switchLabel="Back to sign in"
      switchHref="/signin"
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}
