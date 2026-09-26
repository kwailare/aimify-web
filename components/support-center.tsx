"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import {
  addCustomerMessageAction,
  createSupportTicketAction,
} from "@/lib/actions/support";
import { formatDateTime } from "@/lib/format-date";
import { TICKET_STATUS_LABELS, type TicketStatus } from "@/lib/support-shared";

export type CustomerTicket = {
  id: string;
  reference: string;
  subject: string;
  status: string;
  updatedAt: string;
  messages: { id: string; kind: string; body: string; createdAt: string }[];
};

type Notice = { kind: "error" | "success"; text: string } | null;

export function SupportCenter({ tickets }: { tickets: CustomerTicket[] }) {
  const router = useRouter();
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);

    setNotice(null);
    setBusy("create");

    const result = await createSupportTicketAction(
      String(data.get("subject") ?? ""),
      String(data.get("message") ?? ""),
    );

    setBusy(null);

    if ("error" in result && result.error) {
      setNotice({ kind: "error", text: result.error });
      return;
    }

    form.reset();
    setNotice({
      kind: "success",
      text: `Thanks. Your reference is ${"reference" in result ? result.reference : ""}. We've emailed you a copy.`,
    });
    router.refresh();
  };

  const handleReply = async (ticketId: string) => {
    setNotice(null);
    setBusy(ticketId);

    const result = await addCustomerMessageAction(ticketId, drafts[ticketId] ?? "");

    setBusy(null);

    if (result?.error) {
      setNotice({ kind: "error", text: result.error });
      return;
    }

    setDrafts((current) => ({ ...current, [ticketId]: "" }));
    setNotice({ kind: "success", text: "Message sent." });
    router.refresh();
  };

  return (
    <div className="dash-stack dash-stack--wide">
      {notice && (
        <p
          className={notice.kind === "error" ? "auth-error" : "auth-success"}
          role={notice.kind === "error" ? "alert" : "status"}
        >
          {notice.text}
        </p>
      )}

      <form className="dash-card dash-form" onSubmit={handleCreate}>
        <p className="dash-card-label">New message</p>
        <div className="auth-field">
          <label className="auth-label" htmlFor="support-subject">
            Subject
          </label>
          <input
            className="auth-input"
            id="support-subject"
            name="subject"
            maxLength={150}
            required
          />
        </div>
        <div className="auth-field">
          <label className="auth-label" htmlFor="support-message">
            How can we help?
          </label>
          <textarea
            className="auth-input"
            id="support-message"
            name="message"
            rows={5}
            maxLength={5000}
            required
          />
        </div>
        <button
          className="auth-submit dash-submit"
          type="submit"
          disabled={busy === "create"}
        >
          {busy === "create" ? "Sending…" : "Send message"}
        </button>
      </form>

      <div className="dash-card">
        <div className="admin-stat-row">
          <p className="dash-card-label">Your conversations</p>
          <span className="admin-subline">{tickets.length} total</span>
        </div>
        {tickets.length === 0 ? (
          <p className="dash-card-note">
            You haven&apos;t contacted support yet. Messages you send appear here
            with our replies.
          </p>
        ) : (
          <ul className="admin-feed">
            {tickets.map((ticket) => {
              const isOpen = expandedId === ticket.id;

              return (
                <li key={ticket.id} className="support-thread">
                  <div className="support-thread-head">
                    <span className="admin-stack">
                      <span>{ticket.subject}</span>
                      <span className="admin-subline" suppressHydrationWarning>
                        {ticket.reference} · updated {formatDateTime(ticket.updatedAt)}
                      </span>
                    </span>
                    <span className="dash-inline-actions">
                      <span
                        className={`dash-badge ${ticket.status === "resolved" ? "is-upcoming" : "is-active"}`}
                      >
                        {TICKET_STATUS_LABELS[ticket.status as TicketStatus] ?? ticket.status}
                      </span>
                      <button
                        className="dash-table-action"
                        type="button"
                        onClick={() => setExpandedId(isOpen ? null : ticket.id)}
                      >
                        {isOpen ? "Hide" : "View"}
                      </button>
                    </span>
                  </div>

                  {isOpen && (
                    <div className="support-thread-body">
                      {ticket.messages.map((message) => (
                        <div
                          key={message.id}
                          className={`support-message ${message.kind === "reply" ? "is-reply" : ""}`}
                        >
                          <span className="admin-subline" suppressHydrationWarning>
                            {message.kind === "reply" ? "Aimify Support" : "You"} ·{" "}
                            {formatDateTime(message.createdAt)}
                          </span>
                          <span className="support-body">{message.body}</span>
                        </div>
                      ))}
                      <div className="auth-field">
                        <label
                          className="auth-label"
                          htmlFor={`support-reply-${ticket.id}`}
                        >
                          Add a message
                        </label>
                        <textarea
                          className="auth-input"
                          id={`support-reply-${ticket.id}`}
                          rows={3}
                          maxLength={5000}
                          value={drafts[ticket.id] ?? ""}
                          onChange={(event) =>
                            setDrafts((current) => ({
                              ...current,
                              [ticket.id]: event.target.value,
                            }))
                          }
                        />
                      </div>
                      <div className="dash-inline-actions">
                        <button
                          className="auth-submit dash-submit"
                          type="button"
                          disabled={busy !== null || !(drafts[ticket.id] ?? "").trim()}
                          onClick={() => handleReply(ticket.id)}
                        >
                          {busy === ticket.id ? "Sending…" : "Send"}
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
