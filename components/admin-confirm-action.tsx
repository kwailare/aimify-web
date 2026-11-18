"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// A button for a heavy admin action: it first asks, and for anything that
// can't be undone it wants the name (or email) typed exactly.
export function AdminConfirmAction({
  label,
  question,
  confirmLabel,
  typeToConfirm,
  tone = "danger",
  action,
  onDone,
}: {
  label: string;
  question: string;
  confirmLabel: string;
  typeToConfirm?: string;
  tone?: "danger" | "positive";
  action: (typed: string) => Promise<{ error?: string } | undefined>;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toneClass = tone === "danger" ? "is-danger" : "is-positive";
  const ready = !typeToConfirm || typed.trim() === typeToConfirm.trim();

  const close = () => {
    setConfirming(false);
    setTyped("");
    setError(null);
  };

  const handleConfirm = async () => {
    setError(null);
    setIsPending(true);
    const result = await action(typed).catch(() => ({
      error: "Something went wrong. Refresh and try again.",
    }));
    setIsPending(false);

    if (result?.error) {
      setError(result.error);
      return;
    }

    close();
    onDone?.();
    router.refresh();
  };

  if (!confirming) {
    return (
      <button
        className={`dash-table-action ${toneClass}`}
        type="button"
        onClick={() => setConfirming(true)}
      >
        {label}
      </button>
    );
  }

  return (
    <span className="admin-confirm">
      <span className="admin-subline">{question}</span>
      {typeToConfirm && (
        <input
          className="auth-input admin-confirm-input"
          type="text"
          autoComplete="off"
          aria-label={`Type ${typeToConfirm} to confirm`}
          placeholder={`Type ${typeToConfirm}`}
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
        />
      )}
      <span className="admin-confirm-buttons">
        <button
          className={`dash-table-action ${toneClass}`}
          type="button"
          disabled={isPending || !ready}
          onClick={handleConfirm}
        >
          {isPending ? "Working…" : confirmLabel}
        </button>
        <button
          className="dash-table-action"
          type="button"
          disabled={isPending}
          onClick={close}
        >
          Cancel
        </button>
      </span>
      {error && <span className="auth-error">{error}</span>}
    </span>
  );
}
