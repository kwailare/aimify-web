"use client";

import { useState } from "react";
import { sendUserVerificationEmailAction } from "@/lib/actions/admin";

export function AdminSendVerificationButton({ userId }: { userId: string }) {
  const [isPending, setIsPending] = useState(false);
  const [notice, setNotice] = useState<{
    kind: "error" | "success";
    text: string;
  } | null>(null);

  const handleClick = async () => {
    setNotice(null);
    setIsPending(true);

    const result = await sendUserVerificationEmailAction(userId);

    setIsPending(false);
    setNotice(
      result?.error
        ? { kind: "error", text: result.error }
        : { kind: "success", text: "Confirmation link sent." },
    );
  };

  return (
    <>
      <button
        className="dash-table-action"
        type="button"
        onClick={handleClick}
        disabled={isPending}
      >
        {isPending ? "Sending…" : "Send confirmation link"}
      </button>
      {notice && (
        <span
          className={notice.kind === "error" ? "auth-error" : "auth-success"}
          role={notice.kind === "error" ? "alert" : "status"}
        >
          {notice.text}
        </span>
      )}
    </>
  );
}
