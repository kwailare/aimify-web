"use client";

import { ArrowUpRight, MailCheck } from "lucide-react";
import { useState, type FormEvent } from "react";
import { requestPasswordResetAction } from "@/lib/actions/auth";

export function ForgotPasswordForm() {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsPending(true);

    const formData = new FormData(event.currentTarget);
    const result = await requestPasswordResetAction(formData);

    setIsPending(false);

    if (result?.error) {
      setError(result.error);
      return;
    }

    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="auth-confirmation">
        <span className="auth-confirmation-icon" aria-hidden="true">
          <MailCheck size={22} strokeWidth={1.8} />
        </span>
        <p>
          If an account exists for that email, we&apos;ve sent a link to
          reset your password. It works for 1 hour. Nothing arrived? Check
          your spam folder or email{" "}
          <a href="mailto:support@aimify.app">support@aimify.app</a>.
        </p>
      </div>
    );
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
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
      {error && <p className="auth-error">{error}</p>}
      <button className="auth-submit" type="submit" disabled={isPending}>
        {isPending ? "Sending…" : "Email me a reset link"}
        <ArrowUpRight size={16} aria-hidden="true" />
      </button>
    </form>
  );
}
