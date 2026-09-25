"use client";

import { ArrowUpRight, CircleCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { verifyEmailAction } from "@/lib/actions/auth";

export function ConfirmEmailForm({ token }: { token: string }) {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const handleConfirm = async () => {
    setError(null);
    setIsPending(true);

    const result = await verifyEmailAction(token);

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
        <p>Your email address is confirmed.</p>
        <Link className="hero-primary" href="/dashboard">
          Continue to Aimify
        </Link>
      </div>
    );
  }

  return (
    <div className="auth-form">
      {error && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}
      <button
        className="auth-submit"
        type="button"
        onClick={handleConfirm}
        disabled={isPending}
      >
        {isPending ? "Confirming…" : "Confirm my email"}
        <ArrowUpRight size={16} aria-hidden="true" />
      </button>
    </div>
  );
}
