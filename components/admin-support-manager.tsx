"use client";

import { useRouter } from "next/navigation";
import { Fragment, useState } from "react";
import {
  addTicketNoteAction,
  replyToTicketAction,
  setTicketStatusAction,
} from "@/lib/actions/admin-support";
import { formatDateTime } from "@/lib/format-date";
import { TICKET_STATUS_LABELS, type TicketStatus } from "@/lib/support-shared";

export type AdminTicket = {
  id: string;
  reference: string;
  name: string;
  email: string;
  subject: string;
  status: string;
  source: string;
  organizationName: string | null;
  createdAt: string;
  updatedAt: string;
  messages: {
    id: string;
    kind: string;
    body: string;
    authorName: string | null;
    emailed: boolean;
    createdAt: string;
  }[];
};

type Notice = { ticketId: string; kind: "error" | "success"; text: string } | null;

const FILTERS: { key: "active" | TicketStatus | "all"; label: string }[] = [
  { key: "active", label: "Needs attention" },
  { key: "open", label: "Open" },
  { key: "pending", label: "Waiting on customer" },
  { key: "resolved", label: "Resolved" },
  { key: "all", label: "All" },
];

const KIND_LABELS: Record<string, string> = {
  customer: "Customer",
  reply: "Aimify reply",
  note: "Internal note",
};

function statusBadge(status: string) {
  return status === "open"
    ? "is-active"
    : status === "pending"
      ? "is-upcoming"
      : "is-upcoming";
}

export function AdminSupportManager({
  tickets,
  counts,
}: {
  tickets: AdminTicket[];
  counts: Record<string, number>;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("active");
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);

  const query = search.trim().toLowerCase();

  const visible = tickets.filter((ticket) => {
    if (filter === "active" && ticket.status === "resolved") return false;
    if (filter !== "active" && filter !== "all" && ticket.status !== filter) return false;
    if (!query) return true;

    return [ticket.reference, ticket.name, ticket.email, ticket.subject, ticket.organizationName ?? ""].some(
      (value) => value.toLowerCase().includes(query),
    );
  });

  const run = async (
    ticketId: string,
    key: string,
    action: () => Promise<{ error?: string; success?: boolean }>,
    successText: string,
    clearDraft = false,
  ) => {
    setNotice(null);
    setBusy(key);

    const result = await action();

    setBusy(null);

    if (result?.error) {
      setNotice({ ticketId, kind: "error", text: result.error });
      router.refresh();
      return;
    }

    if (clearDraft) setDrafts((current) => ({ ...current, [ticketId]: "" }));

    setNotice({ ticketId, kind: "success", text: successText });
    router.refresh();
  };

  return (
    <div className="dash-stack dash-stack--wide">
      <div className="admin-stat-row">
        <span>
          {counts.open ?? 0} open · {counts.pending ?? 0} waiting on customer ·{" "}
          {counts.resolved ?? 0} resolved
        </span>
      </div>

      <div className="admin-toolbar">
        <div className="auth-field">
          <label className="auth-label" htmlFor="ticket-search">
            Search
          </label>
          <input
            className="auth-input"
            id="ticket-search"
            type="text"
            placeholder="Search by reference, name, email, subject or organization"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div className="auth-field admin-toolbar-filter">
          <label className="auth-label" htmlFor="ticket-filter">
            Show
          </label>
          <select
            className="auth-input"
            id="ticket-filter"
            value={filter}
            onChange={(event) => setFilter(event.target.value as typeof filter)}
          >
            {FILTERS.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="dash-card">
        {visible.length === 0 ? (
          <p className="dash-card-note">
            {tickets.length === 0
              ? "No support messages yet. Contact-form and dashboard messages appear here."
              : "No tickets match."}
          </p>
        ) : (
          <div className="dash-table-wrap">
            <table className="dash-table">
              <thead>
                <tr>
                  <th>Ticket</th>
                  <th>From</th>
                  <th>Status</th>
                  <th>Updated</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((ticket) => {
                  const isOpen = expandedId === ticket.id;
                  const draft = drafts[ticket.id] ?? "";

                  return (
                    <Fragment key={ticket.id}>
                      <tr>
                        <td>
                          <span className="admin-stack">
                            <span>{ticket.subject}</span>
                            <span className="admin-subline">
                              {ticket.reference} ·{" "}
                              {ticket.source === "dashboard" ? "From dashboard" : "Contact form"}
                            </span>
                          </span>
                        </td>
                        <td>
                          <span className="admin-stack">
                            <span>{ticket.name}</span>
                            <span className="admin-subline">
                              {ticket.email}
                              {ticket.organizationName ? ` · ${ticket.organizationName}` : ""}
                            </span>
                          </span>
                        </td>
                        <td>
                          <span className={`dash-badge ${statusBadge(ticket.status)}`}>
                            {TICKET_STATUS_LABELS[ticket.status as TicketStatus] ?? ticket.status}
                          </span>
                        </td>
                        <td suppressHydrationWarning>{formatDateTime(ticket.updatedAt)}</td>
                        <td>
                          <button
                            className="dash-table-action"
                            type="button"
                            onClick={() => {
                              setNotice(null);
                              setExpandedId(isOpen ? null : ticket.id);
                            }}
                          >
                            {isOpen ? "Close" : "Open"}
                          </button>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="admin-detail-row">
                          <td colSpan={5}>
                            <div className="admin-stack">
                              <ul className="admin-feed">
                                {ticket.messages.map((message) => (
                                  <li key={message.id}>
                                    <span className="admin-stack">
                                      <span>
                                        {KIND_LABELS[message.kind] ?? message.kind}
                                        {message.authorName && message.kind !== "customer"
                                          ? ` · ${message.authorName}`
                                          : ""}
                                        {message.kind === "reply" && !message.emailed
                                          ? " · email failed"
                                          : ""}
                                      </span>
                                      <span className="support-body">{message.body}</span>
                                    </span>
                                    <span className="admin-subline" suppressHydrationWarning>
                                      {formatDateTime(message.createdAt)}
                                    </span>
                                  </li>
                                ))}
                              </ul>

                              <div className="auth-field">
                                <label
                                  className="auth-label"
                                  htmlFor={`reply-${ticket.id}`}
                                >
                                  Reply to {ticket.name} (sent by email) or add a private note
                                </label>
                                <textarea
                                  className="auth-input"
                                  id={`reply-${ticket.id}`}
                                  rows={4}
                                  maxLength={5000}
                                  value={draft}
                                  onChange={(event) =>
                                    setDrafts((current) => ({
                                      ...current,
                                      [ticket.id]: event.target.value,
                                    }))
                                  }
                                />
                              </div>

                              {notice && notice.ticketId === ticket.id && (
                                <p
                                  className={notice.kind === "error" ? "auth-error" : "auth-success"}
                                  role={notice.kind === "error" ? "alert" : "status"}
                                >
                                  {notice.text}
                                </p>
                              )}

                              <div className="admin-action-bar">
                                <button
                                  className="dash-table-action is-positive"
                                  type="button"
                                  disabled={busy !== null || !draft.trim()}
                                  onClick={() =>
                                    run(
                                      ticket.id,
                                      `reply-${ticket.id}`,
                                      () => replyToTicketAction(ticket.id, draft, false),
                                      "Reply sent.",
                                      true,
                                    )
                                  }
                                >
                                  {busy === `reply-${ticket.id}` ? "Sending…" : "Send reply"}
                                </button>
                                <button
                                  className="dash-table-action is-positive"
                                  type="button"
                                  disabled={busy !== null || !draft.trim()}
                                  onClick={() =>
                                    run(
                                      ticket.id,
                                      `resolve-${ticket.id}`,
                                      () => replyToTicketAction(ticket.id, draft, true),
                                      "Reply sent and ticket resolved.",
                                      true,
                                    )
                                  }
                                >
                                  Send and resolve
                                </button>
                                <button
                                  className="dash-table-action"
                                  type="button"
                                  disabled={busy !== null || !draft.trim()}
                                  onClick={() =>
                                    run(
                                      ticket.id,
                                      `note-${ticket.id}`,
                                      () => addTicketNoteAction(ticket.id, draft),
                                      "Note added.",
                                      true,
                                    )
                                  }
                                >
                                  Save as private note
                                </button>
                                {ticket.status !== "resolved" ? (
                                  <button
                                    className="dash-table-action"
                                    type="button"
                                    disabled={busy !== null}
                                    onClick={() =>
                                      run(
                                        ticket.id,
                                        `status-${ticket.id}`,
                                        () => setTicketStatusAction(ticket.id, "resolved"),
                                        "Ticket resolved.",
                                      )
                                    }
                                  >
                                    Mark resolved
                                  </button>
                                ) : (
                                  <button
                                    className="dash-table-action"
                                    type="button"
                                    disabled={busy !== null}
                                    onClick={() =>
                                      run(
                                        ticket.id,
                                        `status-${ticket.id}`,
                                        () => setTicketStatusAction(ticket.id, "open"),
                                        "Ticket reopened.",
                                      )
                                    }
                                  >
                                    Reopen
                                  </button>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
