"use client";

import { ArrowUpRight, CircleCheck } from "lucide-react";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { PasswordInput } from "@/components/password-input";
import { resetPasswordAction } from "@/lib/actions/auth";

export function ResetPasswordForm({ token }: { token: string }) {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsPending(true);

    const result = await resetPasswordAction(
      token,
      new FormData(event.currentTarget),
    );

    setIsPending(false);

    if (result?.error) {
      setError(result.error);
      return;
    }

    setDone(true);
  };

  if (done) {
    return (
      <div className="auth-confirmation">
        <span className="auth-confirmation-icon" aria-hidden="true">
          <CircleCheck size={22} strokeWidth={1.8} />
        </span>
        <p>Your password has been changed. You can sign in with it now.</p>
        <Link className="hero-primary" href="/signin">
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <PasswordInput
        label="New password"
        name="password"
        autoComplete="new-password"
        placeholder="At least 8 characters"
      />
      <PasswordInput
        label="Confirm new password"
        name="confirmPassword"
        autoComplete="new-password"
      />
      {error && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}
      <button className="auth-submit" type="submit" disabled={isPending}>
        {isPending ? "Saving…" : "Set new password"}
        <ArrowUpRight size={16} aria-hidden="true" />
      </button>
    </form>
  );
}
