"use client";

import { ArrowUpRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { signOut } from "next-auth/react";
import { resendVerificationEmailAction } from "@/lib/actions/auth";

export function VerifyEmailPanel() {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [notice, setNotice] = useState<{
    kind: "error" | "success";
    text: string;
  } | null>(null);

  const handleResend = async () => {
    setNotice(null);
    setIsPending(true);

    const result = await resendVerificationEmailAction();

    setIsPending(false);

    if (result?.error) {
      setNotice({ kind: "error", text: result.error });
      return;
    }

    if (result?.alreadyVerified) {
      router.push("/dashboard");
      return;
    }

    setNotice({
      kind: "success",
      text: "A new link is on its way. Check your spam folder if it doesn't show up in a minute.",
    });
  };

  return (
    <div className="auth-form">
      {notice && (
        <p
          className={notice.kind === "error" ? "auth-error" : "auth-success"}
          role={notice.kind === "error" ? "alert" : "status"}
        >
          {notice.text}
        </p>
      )}
      <button
        className="auth-submit"
        type="button"
        onClick={handleResend}
        disabled={isPending}
      >
        {isPending ? "Sending…" : "Send me a new link"}
        <ArrowUpRight size={16} aria-hidden="true" />
      </button>
      <button
        className="dash-danger-link"
        type="button"
        onClick={() => signOut({ redirectTo: "/signin" })}
      >
        Sign out
      </button>
    </div>
  );
}
