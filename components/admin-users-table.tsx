"use client";

import { useState } from "react";
import { Check, Copy, X } from "lucide-react";
import { resetUserPasswordAction } from "@/lib/actions/admin";
import { formatDate } from "@/lib/format-date";
import type { AdminUser } from "@/lib/admin";

export function AdminUsersTable({ users }: { users: AdminUser[] }) {
  const [search, setSearch] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<{
    email: string;
    password: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  const query = search.trim().toLowerCase();
  const filtered = query
    ? users.filter(
        (user) =>
          user.name.toLowerCase().includes(query) ||
          user.email.toLowerCase().includes(query) ||
          (user.organizationName ?? "").toLowerCase().includes(query),
      )
    : users;

  const handleReset = async (user: AdminUser) => {
    const confirmed = window.confirm(
      `Reset the password for ${user.email}? They will need the new password to sign in.`,
    );

    if (!confirmed) {
      return;
    }

    setPendingId(user.id);
    setRevealed(null);

    const result = await resetUserPasswordAction(user.id);

    setPendingId(null);

    if (result?.temporaryPassword) {
      setRevealed({ email: user.email, password: result.temporaryPassword });
      setCopied(false);
    }
  };

  const handleCopy = async () => {
    if (!revealed) {
      return;
    }

    try {
      await navigator.clipboard.writeText(revealed.password);
      setCopied(true);
    } catch {
      // Clipboard access can be denied by the browser; the password is
      // still visible on screen for the admin to copy manually.
    }
  };

  return (
    <div className="dash-stack">
      <div className="auth-field">
        <label className="auth-label" htmlFor="user-search">
          Search
        </label>
        <input
          className="auth-input"
          id="user-search"
          type="text"
          placeholder="Search by name, email or organization"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      {revealed && (
        <div className="dash-reveal">
          <div className="dash-reveal-head">
            <p className="dash-reveal-label">
              New password for {revealed.email} — copy this now, it won&apos;t
              be shown again.
            </p>
            <button
              className="dash-reveal-dismiss"
              type="button"
              aria-label="Dismiss"
              onClick={() => setRevealed(null)}
            >
              <X size={14} />
            </button>
          </div>
          <div className="dash-reveal-row">
            <code className="dash-reveal-value">{revealed.password}</code>
            <button
              className="dash-reveal-copy"
              type="button"
              onClick={handleCopy}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      )}

      <div className="dash-card">
        {filtered.length === 0 ? (
          <p className="dash-card-note">No users match your search.</p>
        ) : (
          <div className="dash-table-wrap">
            <table className="dash-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Organization</th>
                  <th>Joined</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <span className="dash-user-name">
                        {user.name}
                        {user.isAdmin && (
                          <span className="admin-badge">Admin</span>
                        )}
                      </span>
                    </td>
                    <td>{user.email}</td>
                    <td>
                      {user.organizationName
                        ? `${user.organizationName} (${user.role})`
                        : "—"}
                    </td>
                    <td>{formatDate(user.createdAt)}</td>
                    <td>
                      <button
                        className="dash-table-action is-danger"
                        type="button"
                        onClick={() => handleReset(user)}
                        disabled={pendingId === user.id}
                      >
                        {pendingId === user.id
                          ? "Resetting…"
                          : "Reset password"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
