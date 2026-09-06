import type { Metadata } from "next";
import { AuthShell } from "@/components/auth-shell";
import { SignUpForm } from "@/components/signup-form";

export const metadata: Metadata = {
  title: "Create your account | Aimify",
  description:
    "Start your free trial of Aimify — one secure, auditable platform for inventory, sales and credit.",
};

export default function SignUpPage() {
  return (
    <AuthShell
      eyebrow="Start free for 14 days"
      title="Create your Aimify account"
      subtitle="Set up your organization in minutes — no card required, no IT department needed."
      switchText="Already have an account?"
      switchLabel="Sign in"
      switchHref="/signin"
    >
      <SignUpForm />
    </AuthShell>
  );
}
