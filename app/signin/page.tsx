import type { Metadata } from "next";
import { AuthShell } from "@/components/auth-shell";
import { SignInForm } from "@/components/signin-form";

export const metadata: Metadata = {
  title: "Sign in | Aimify",
  description: "Sign in to your Aimify inventory and warehouse workspace.",
};

export default function SignInPage() {
  return (
    <AuthShell
      eyebrow="Welcome back"
      title="Sign in to Aimify"
      subtitle="Pick up right where you left off — every change is still exactly as your team left it."
      switchText="Don't have an account?"
      switchLabel="Start a free trial"
      switchHref="/signup"
    >
      <SignInForm />
    </AuthShell>
  );
}
