"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  reactivateOrganizationAction,
  suspendOrganizationAction,
} from "@/lib/actions/admin";

export function OrgActionButton({
  organizationId,
  status,
}: {
  organizationId: string;
  status: string;
}) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const isSuspended = status === "suspended";

  const handleClick = async () => {
    setIsPending(true);

    if (isSuspended) {
      await reactivateOrganizationAction(organizationId);
    } else {
      await suspendOrganizationAction(organizationId);
    }

    setIsPending(false);
    router.refresh();
  };

  return (
    <button
      className={`dash-table-action ${isSuspended ? "is-positive" : "is-danger"}`}
      type="button"
      onClick={handleClick}
      disabled={isPending}
    >
      {isPending ? "Working…" : isSuspended ? "Reactivate" : "Suspend"}
    </button>
  );
}
