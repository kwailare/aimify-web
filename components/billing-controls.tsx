"use client";

import { ArrowUpRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  removeCardAction,
  resumeSubscriptionAction,
  startCheckoutAction,
} from "@/lib/actions/billing";

type Notice = { kind: "error" | "success"; text: string } | null;

export function BillingControls({
  canPay,
  isOwner,
  payLabel,
  showPay,
  cardLabel,
  cancelScheduledFor,
}: {
  canPay: boolean;
  isOwner: boolean;
  payLabel: string;
  showPay: boolean;
  cardLabel: string | null;
  cancelScheduledFor: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);

  const pay = async () => {
    setNotice(null);
    setBusy("pay");

    const result = await startCheckoutAction();

    if ("error" in result && result.error) {
      setBusy(null);
      setNotice({ kind: "error", text: result.error });
      return;
    }

    if ("url" in result && result.url) {
      window.location.href = result.url;
    }
  };

  const removeCard = async () => {
    setNotice(null);
    setBusy("card");

    const result = await removeCardAction();

    setBusy(null);

    if (result?.error) {
      setNotice({ kind: "error", text: result.error });
      return;
    }

    setNotice({ kind: "success", text: "Saved card removed." });
    router.refresh();
  };

  const resume = async () => {
    setNotice(null);
    setBusy("resume");

    const result = await resumeSubscriptionAction();

    setBusy(null);

    if (result?.error) {
      setNotice({ kind: "error", text: result.error });
      return;
    }

    setNotice({ kind: "success", text: "Your subscription will keep renewing." });
    router.refresh();
  };

  return (
    <div className="dash-stack">
      {notice && (
        <p
          className={notice.kind === "error" ? "auth-error" : "auth-success"}
          role={notice.kind === "error" ? "alert" : "status"}
        >
          {notice.text}
        </p>
      )}

      {cancelScheduledFor && (
        <div className="dash-inline-actions">
          <span className="admin-subline">
            Your subscription ends on {cancelScheduledFor} and won&apos;t renew.
          </span>
          {isOwner && (
            <button
              className="dash-table-action is-positive"
              type="button"
              disabled={busy !== null}
              onClick={resume}
            >
              {busy === "resume" ? "Working…" : "Keep my subscription"}
            </button>
          )}
        </div>
      )}

      {showPay && canPay && (
        <div className="dash-inline-actions">
          <button
            className="auth-submit dash-submit"
            type="button"
            disabled={busy !== null}
            onClick={pay}
          >
            {busy === "pay" ? "Opening Paystack…" : payLabel}
            <ArrowUpRight size={16} aria-hidden="true" />
          </button>
          <span className="admin-subline">
            Secure payment by Paystack. Card, bank transfer and USSD are
            supported. Card payments are saved for automatic renewal.
          </span>
        </div>
      )}

      {showPay && !canPay && (
        <p className="dash-empty">
          Only an Owner or Administrator can make payments.
        </p>
      )}

      {cardLabel && (
        <div className="dash-inline-actions">
          <span className="admin-subline">Saved card: {cardLabel}</span>
          {canPay && (
            <button
              className="dash-table-action is-danger"
              type="button"
              disabled={busy !== null}
              onClick={removeCard}
            >
              {busy === "card" ? "Working…" : "Remove card"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
