"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { verifyUserEmailAction } from "@/lib/actions/admin";

export function AdminVerifyEmailButton({ userId }: { userId: string }) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);

  const handleClick = async () => {
    setIsPending(true);
    await verifyUserEmailAction(userId);
    setIsPending(false);
    router.refresh();
  };

  return (
    <button
      className="dash-table-action is-positive"
      type="button"
      onClick={handleClick}
      disabled={isPending}
    >
      {isPending ? "Working…" : "Verify email"}
    </button>
  );
}
