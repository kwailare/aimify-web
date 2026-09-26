"use client";

import { useEffect, useState } from "react";
import { getRecentActivityAction } from "@/lib/actions/admin";
import type { RecentActivityItem } from "@/lib/audit";
import { formatDateTime } from "@/lib/format-date";

type Result = { items: RecentActivityItem[] } | { error: string } | null;

export function AdminActivityList({
  kind,
  id,
}: {
  kind: "organization" | "user";
  id: string;
}) {
  const [result, setResult] = useState<Result>(null);

  useEffect(() => {
    let cancelled = false;

    getRecentActivityAction(kind, id).then((next) => {
      if (!cancelled) setResult(next);
    });

    return () => {
      cancelled = true;
    };
  }, [kind, id]);

  if (!result) {
    return <p className="admin-subline">Loading recent activity…</p>;
  }

  if ("error" in result) {
    return <p className="auth-error">{result.error}</p>;
  }

  if (result.items.length === 0) {
    return <p className="admin-subline">No activity recorded yet.</p>;
  }

  return (
    <ul className="admin-activity-list">
      {result.items.map((item) => (
        <li key={item.id}>
          <span className="admin-activity-when">
            {formatDateTime(item.createdAt)}
          </span>
          <span>
            <strong>{item.label}</strong> · {item.actorName}
            {item.details && (
              <span className="admin-subline">{item.details}</span>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}
