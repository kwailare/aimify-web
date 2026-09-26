"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { resetTwoFactorAction } from "@/lib/actions/admin";

export function AdminResetTwoFactorButton({ userId }: { userId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    setError(null);
    setIsPending(true);

    const result = await resetTwoFactorAction(userId);

    setIsPending(false);

    if (result?.error) {
      setError(result.error);
      return;
    }

    setConfirming(false);
    router.refresh();
  };

  if (!confirming) {
    return (
      <button
        className="dash-table-action is-danger"
        type="button"
        onClick={() => setConfirming(true)}
      >
        Reset two-factor
      </button>
    );
  }

  return (
    <>
      <span className="admin-subline">
        Turn off two-factor and sign this person out everywhere?
      </span>
      <button
        className="dash-table-action is-danger"
        type="button"
        disabled={isPending}
        onClick={handleConfirm}
      >
        {isPending ? "Working…" : "Yes, reset"}
      </button>
      <button
        className="dash-table-action"
        type="button"
        disabled={isPending}
        onClick={() => setConfirming(false)}
      >
        Cancel
      </button>
      {error && <span className="auth-error">{error}</span>}
    </>
  );
}
