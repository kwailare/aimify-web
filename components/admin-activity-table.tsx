"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  clearActivityHistoryAction,
  countActivityToClearAction,
} from "@/lib/actions/admin";
import {
  CLEAR_RANGES,
  CLEAR_RANGE_LABELS,
  type ClearRange,
} from "@/lib/activity-ranges";
import { formatDate, formatDateTime } from "@/lib/format-date";

export type ActivityRow = {
  id: string;
  createdAt: Date;
  actorName: string | null;
  actorEmail: string | null;
  organizationName: string | null;
  module: string;
  label: string;
  details: string;
};

export function AdminActivityTable({
  rows,
  total,
  oldest,
  nextLimit,
}: {
  rows: ActivityRow[];
  total: number;
  oldest: Date | null;
  nextLimit: number | null;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [moduleFilter, setModuleFilter] = useState("all");
  const [clearOpen, setClearOpen] = useState(false);
  const [range, setRange] = useState<ClearRange>("30d");
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [typed, setTyped] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [notice, setNotice] = useState<{
    kind: "error" | "success";
    text: string;
  } | null>(null);

  const modules = Array.from(new Set(rows.map((row) => row.module))).sort();
  const query = search.trim().toLowerCase();

  const filtered = rows.filter((row) => {
    if (moduleFilter !== "all" && row.module !== moduleFilter) return false;
    if (!query) return true;

    return [
      row.label,
      row.details,
      row.actorName ?? "",
      row.actorEmail ?? "",
      row.organizationName ?? "",
    ].some((value) => value.toLowerCase().includes(query));
  });

  const loadCount = async (nextRange: ClearRange) => {
    setPreviewCount(null);
    const result = await countActivityToClearAction(nextRange);

    if (result?.error) {
      setNotice({ kind: "error", text: result.error });
      return;
    }

    setPreviewCount(result.count ?? 0);
  };

  const openClear = () => {
    setNotice(null);
    setTyped("");
    setClearOpen(true);
    void loadCount(range);
  };

  const changeRange = (next: ClearRange) => {
    setRange(next);
    setTyped("");
    void loadCount(next);
  };

  const confirmClear = async () => {
    setNotice(null);
    setIsPending(true);

    const result = await clearActivityHistoryAction(range);

    setIsPending(false);

    if (result?.error) {
      setNotice({ kind: "error", text: result.error });
      return;
    }

    setClearOpen(false);
    setNotice({
      kind: "success",
      text: `Cleared ${result.deleted} ${result.deleted === 1 ? "entry" : "entries"}. A record of this was kept.`,
    });
    router.refresh();
  };

  const needsTyping = range === "all";
  const canConfirm =
    previewCount !== null &&
    previewCount > 0 &&
    !isPending &&
    (!needsTyping || typed === "CLEAR");

  return (
    <div className="dash-stack">
      <div className="admin-stat-row">
        <span suppressHydrationWarning>
          {total} {total === 1 ? "entry" : "entries"} stored
          {oldest ? ` · oldest ${formatDate(oldest)}` : ""}
          {` · showing ${filtered.length} of ${rows.length} loaded`}
        </span>
        {!clearOpen && (
          <button
            className="dash-table-action is-danger"
            type="button"
            onClick={openClear}
          >
            Clear history
          </button>
        )}
      </div>

      {notice && !clearOpen && (
        <p
          className={notice.kind === "error" ? "auth-error" : "auth-success"}
          role={notice.kind === "error" ? "alert" : "status"}
        >
          {notice.text}
        </p>
      )}

      {clearOpen && (
        <div className="admin-clear-panel">
          <p className="admin-detail-title">Clear activity history</p>
          <p className="admin-subline">
            Deleted entries can&apos;t be recovered. A record of who cleared
            the history, when, and how much is always kept.
          </p>
          <div className="admin-toolbar">
            <div className="auth-field admin-toolbar-filter">
              <label className="auth-label" htmlFor="clear-range">
                What to clear
              </label>
              <select
                className="auth-input"
                id="clear-range"
                value={range}
                onChange={(event) =>
                  changeRange(event.target.value as ClearRange)
                }
              >
                {CLEAR_RANGES.map((value) => (
                  <option key={value} value={value}>
                    {CLEAR_RANGE_LABELS[value]}
                  </option>
                ))}
              </select>
            </div>
            {needsTyping && (
              <div className="auth-field admin-toolbar-filter">
                <label className="auth-label" htmlFor="clear-confirm-text">
                  Type CLEAR to confirm
                </label>
                <input
                  className="auth-input"
                  id="clear-confirm-text"
                  type="text"
                  autoComplete="off"
                  value={typed}
                  onChange={(event) => setTyped(event.target.value)}
                />
              </div>
            )}
          </div>
          <p role="status">
            {previewCount === null
              ? "Counting…"
              : previewCount === 0
                ? "Nothing matches, so there is nothing to clear."
                : `This will permanently delete ${previewCount} ${previewCount === 1 ? "entry" : "entries"}.`}
          </p>
          {notice && (
            <p
              className={notice.kind === "error" ? "auth-error" : "auth-success"}
              role="alert"
            >
              {notice.text}
            </p>
          )}
          <div className="dash-inline-actions">
            <button
              className="auth-submit dash-submit"
              type="button"
              disabled={!canConfirm}
              onClick={confirmClear}
            >
              {isPending ? "Clearing…" : "Clear now"}
            </button>
            <button
              className="dash-table-action"
              type="button"
              disabled={isPending}
              onClick={() => setClearOpen(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="admin-toolbar">
        <div className="auth-field">
          <label className="auth-label" htmlFor="activity-search">
            Search
          </label>
          <input
            className="auth-input"
            id="activity-search"
            type="text"
            placeholder="Search by person, organization, action or details"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div className="auth-field admin-toolbar-filter">
          <label className="auth-label" htmlFor="activity-module">
            Area
          </label>
          <select
            className="auth-input"
            id="activity-module"
            value={moduleFilter}
            onChange={(event) => setModuleFilter(event.target.value)}
          >
            <option value="all">All areas</option>
            {modules.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="dash-card">
        {filtered.length === 0 ? (
          <p className="dash-card-note">
            {rows.length === 0
              ? "No activity recorded yet."
              : "No activity matches."}
          </p>
        ) : (
          <div className="dash-table-wrap">
            <table className="dash-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Who</th>
                  <th>Organization</th>
                  <th>Action</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.id}>
                    <td suppressHydrationWarning>
                      {formatDateTime(row.createdAt)}
                    </td>
                    <td>
                      <span className="admin-stack">
                        <span>{row.actorName ?? "System"}</span>
                        {row.actorEmail && (
                          <span className="admin-subline">{row.actorEmail}</span>
                        )}
                      </span>
                    </td>
                    <td>{row.organizationName ?? "—"}</td>
                    <td>
                      <span className="admin-stack">
                        <span>{row.label}</span>
                        <span className="admin-subline">{row.module}</span>
                      </span>
                    </td>
                    <td>
                      <span className="admin-subline">{row.details || "—"}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {nextLimit && (
        <Link className="dash-banner-link" href={`/admin/activity?limit=${nextLimit}`}>
          Load more entries
        </Link>
      )}
    </div>
  );
}
