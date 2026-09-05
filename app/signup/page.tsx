import type { Metadata } from "next";
import { ArrowUpRight } from "lucide-react";
import { AuthShell } from "@/components/auth-shell";
import { PasswordInput } from "@/components/password-input";

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
      <form className="auth-form" action="#">
        <div className="auth-field-row">
          <div className="auth-field">
            <label className="auth-label" htmlFor="signup-name">
              Full name
            </label>
            <input
              className="auth-input"
              id="signup-name"
              name="name"
              type="text"
              autoComplete="name"
              placeholder="Ada Obi"
              required
            />
          </div>
          <div className="auth-field">
            <label className="auth-label" htmlFor="signup-company">
              Company name
            </label>
            <input
              className="auth-input"
              id="signup-company"
              name="company"
              type="text"
              autoComplete="organization"
              placeholder="Obi Distribution Ltd"
              required
            />
          </div>
        </div>
        <div className="auth-field">
          <label className="auth-label" htmlFor="signup-email">
            Work email
          </label>
          <input
            className="auth-input"
            id="signup-email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@company.com"
            required
          />
        </div>
        <PasswordInput
          label="Password"
          name="password"
          autoComplete="new-password"
          placeholder="At least 8 characters"
        />
        <label className="auth-checkbox-row">
          <input type="checkbox" name="terms" required />
          I agree to the{" "}
          <a href="/#terms">Terms of Service</a> and{" "}
          <a href="/#privacy">Privacy Policy</a>
        </label>
        <button className="auth-submit" type="submit">
          Start free trial
          <ArrowUpRight size={16} aria-hidden="true" />
        </button>
      </form>
    </AuthShell>
  );
}
