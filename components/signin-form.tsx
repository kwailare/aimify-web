"use client";

import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { PasswordInput } from "@/components/password-input";
import { signInAction } from "@/lib/actions/auth";

export function SignInForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [needsCode, setNeedsCode] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsPending(true);

    const formData = new FormData(event.currentTarget);
    const result = await signInAction(formData);

    setIsPending(false);

    if (result?.twoFactorRequired) {
      setNeedsCode(true);
    }

    if (result?.error) {
      setError(result.error);
      return;
    }

    if (result?.twoFactorRequired) {
      return;
    }

    router.push("/dashboard");
  };

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
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
      {needsCode && (
        <div className="auth-field">
          <label className="auth-label" htmlFor="signin-code">
            Authentication code
          </label>
          <input
            className="auth-input"
            id="signin-code"
            name="code"
            type="text"
            inputMode="text"
            autoComplete="one-time-code"
            placeholder="123456"
            autoFocus
            required
          />
          <p className="dash-card-note">
            Enter the 6-digit code from your authenticator app, or one of your
            backup codes.
          </p>
        </div>
      )}
      <div className="auth-row">
        <label className="auth-checkbox-row">
          <input type="checkbox" name="remember" />
          Remember me
        </label>
        <Link className="auth-forgot" href="/forgot-password">
          Forgot password?
        </Link>
      </div>
      {error && <p className="auth-error">{error}</p>}
      <button className="auth-submit" type="submit" disabled={isPending}>
        {isPending ? "Signing in…" : needsCode ? "Verify and sign in" : "Sign in"}
        <ArrowUpRight size={16} aria-hidden="true" />
      </button>
    </form>
  );
}
