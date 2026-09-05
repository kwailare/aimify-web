import type { Metadata } from "next";
import { ArrowUpRight } from "lucide-react";
import { AuthShell } from "@/components/auth-shell";

export const metadata: Metadata = {
  title: "Reset your password | Aimify",
  description: "Get a password reset link sent to your work email.",
};

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      eyebrow="Account recovery"
      title="Reset your password"
      subtitle="Enter the email on your account and we'll send you a link to set a new password."
      switchText="Remembered it after all?"
      switchLabel="Back to sign in"
      switchHref="/signin"
    >
      <form className="auth-form" action="#">
        <div className="auth-field">
          <label className="auth-label" htmlFor="forgot-email">
            Work email
          </label>
          <input
            className="auth-input"
            id="forgot-email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@company.com"
            required
          />
        </div>
        <button className="auth-submit" type="submit">
          Send reset link
          <ArrowUpRight size={16} aria-hidden="true" />
        </button>
      </form>
    </AuthShell>
  );
}
