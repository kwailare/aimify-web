"use client";

import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { PasswordInput } from "@/components/password-input";

export function SignInForm() {
  const router = useRouter();

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
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
      <button className="auth-submit" type="submit">
        Sign in
        <ArrowUpRight size={16} aria-hidden="true" />
      </button>
    </form>
  );
}
