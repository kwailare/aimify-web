"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { cancelSubscriptionAction } from "@/lib/actions/organization";

export function CancelSubscriptionButton() {
  const router = useRouter();
  const [isConfirming, setIsConfirming] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCancel = async () => {
    setError(null);
    setIsPending(true);

    const result = await cancelSubscriptionAction();

    setIsPending(false);

    if (result?.error) {
      setError(result.error);
      return;
    }

    setIsConfirming(false);
    router.refresh();
  };

  if (!isConfirming) {
    return (
      <button
        className="dash-danger-link"
        type="button"
        onClick={() => setIsConfirming(true)}
      >
        Cancel subscription
      </button>
    );
  }

  return (
    <div className="dash-card dash-form">
      <p className="dash-card-label">Cancel subscription</p>
      <p className="dash-empty">
        The desktop app stops working as soon as you cancel. To come back
        later you&apos;ll need to contact support to reactivate.
      </p>
      {error && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}
      <div className="dash-inline-actions">
        <button
          className="auth-submit dash-submit"
          type="button"
          onClick={handleCancel}
          disabled={isPending}
        >
          {isPending ? "Cancelling…" : "Yes, cancel my subscription"}
        </button>
        <button
          className="dash-danger-link"
          type="button"
          onClick={() => setIsConfirming(false)}
          disabled={isPending}
        >
          Keep my subscription
        </button>
      </div>
    </div>
  );
}
