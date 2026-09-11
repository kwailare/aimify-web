"use client";

import { useState, type FormEvent } from "react";
import { Check, Copy, X } from "lucide-react";
import { resetUserPasswordAction } from "@/lib/actions/admin";
import { formatDate } from "@/lib/format-date";
import type { AdminUser } from "@/lib/admin";

type ResetMode = "generate" | "manual";

export function AdminUsersTable({ users }: { users: AdminUser[] }) {
  const [search, setSearch] = useState("");
  const [resetTarget, setResetTarget] = useState<AdminUser | null>(null);
  const [mode, setMode] = useState<ResetMode>("generate");
  const [isPending, setIsPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<{
    email: string;
    password: string;
  } | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
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

  const openResetPanel = (user: AdminUser) => {
    setResetTarget(user);
    setMode("generate");
    setFormError(null);
    setRevealed(null);
    setSuccessMessage(null);
  };

  const closeResetPanel = () => {
    setResetTarget(null);
    setFormError(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!resetTarget) {
      return;
    }

    setFormError(null);

    const formData = new FormData(event.currentTarget);
    const manualPassword =
      mode === "manual" ? String(formData.get("password") ?? "") : undefined;

    if (mode === "manual" && (!manualPassword || manualPassword.length < 8)) {
      setFormError("Password must be at least 8 characters.");
      return;
    }

    setIsPending(true);
    const result = await resetUserPasswordAction(resetTarget.id, manualPassword);
    setIsPending(false);

    if (result?.error) {
      setFormError(result.error);
      return;
    }

    if (result?.temporaryPassword) {
      setRevealed({ email: resetTarget.email, password: result.temporaryPassword });
      setCopied(false);
    } else {
      setSuccessMessage(`Password updated for ${resetTarget.email}.`);
    }

    setResetTarget(null);
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

      {resetTarget && (
        <form className="dash-reveal" onSubmit={handleSubmit}>
          <div className="dash-reveal-head">
            <p className="dash-reveal-label">
              Reset password for {resetTarget.email}
            </p>
            <button
              className="dash-reveal-dismiss"
              type="button"
              aria-label="Cancel"
              onClick={closeResetPanel}
            >
              <X size={14} />
            </button>
          </div>

          <div className="payment-method-row">
            <label
              className={`payment-method-option ${mode === "generate" ? "is-selected" : ""}`}
            >
              <input
                type="radio"
                name="reset-mode"
                checked={mode === "generate"}
                onChange={() => setMode("generate")}
              />
              Generate random password
            </label>
            <label
              className={`payment-method-option ${mode === "manual" ? "is-selected" : ""}`}
            >
              <input
                type="radio"
                name="reset-mode"
                checked={mode === "manual"}
                onChange={() => setMode("manual")}
              />
              Set a specific password
            </label>
          </div>

          {mode === "manual" && (
            <div className="auth-field dash-reset-field">
              <label className="auth-label" htmlFor="manual-password">
                New password
              </label>
              <input
                className="auth-input"
                id="manual-password"
                name="password"
                type="text"
                autoComplete="off"
                placeholder="At least 8 characters"
              />
            </div>
          )}

          {formError && <p className="auth-error">{formError}</p>}

          <div className="dash-reveal-row">
            <button className="auth-submit dash-submit" type="submit" disabled={isPending}>
              {isPending ? "Resetting…" : "Confirm reset"}
            </button>
            <button
              className="dash-table-action"
              type="button"
              onClick={closeResetPanel}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

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

      {successMessage && (
        <div className="dash-reveal">
          <div className="dash-reveal-head">
            <p className="dash-reveal-label">{successMessage}</p>
            <button
              className="dash-reveal-dismiss"
              type="button"
              aria-label="Dismiss"
              onClick={() => setSuccessMessage(null)}
            >
              <X size={14} />
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
                        onClick={() => openResetPanel(user)}
                      >
                        Reset password
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
