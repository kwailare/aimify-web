import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { AuthShell } from "@/components/auth-shell";
import { PasswordInput } from "@/components/password-input";

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
      <form className="auth-form" action="#">
        <div className="auth-field">
          <label className="auth-label" htmlFor="signin-email">
            Work email
          </label>
          <input
            className="auth-input"
            id="signin-email"
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
          autoComplete="current-password"
          placeholder="••••••••"
        />
        <div className="auth-row">
          <label className="auth-checkbox-row">
            <input type="checkbox" name="remember" />
            Remember me
          </label>
          <Link className="auth-forgot" href="/forgot-password">
            Forgot password?
          </Link>
        </div>
        <button className="auth-submit" type="submit">
          Sign in
          <ArrowUpRight size={16} aria-hidden="true" />
        </button>
      </form>
    </AuthShell>
  );
}
