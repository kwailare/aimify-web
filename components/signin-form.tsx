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

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsPending(true);

    const formData = new FormData(event.currentTarget);
    const result = await signInAction(formData);

    setIsPending(false);

    if (result?.error) {
      setError(result.error);
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
        {isPending ? "Signing in…" : "Sign in"}
        <ArrowUpRight size={16} aria-hidden="true" />
      </button>
    </form>
  );
}
