"use client";

import { Fragment, useState, type FormEvent } from "react";
import { Check, Copy, X } from "lucide-react";
import { AdminActivityList } from "@/components/admin-activity-list";
import { AdminSendVerificationButton } from "@/components/admin-send-verification-button";
import { AdminResetTwoFactorButton } from "@/components/admin-reset-two-factor-button";
import { AdminVerifyEmailButton } from "@/components/admin-verify-email-button";
import { resetUserPasswordAction } from "@/lib/actions/admin";
import { formatDate, formatDateTime } from "@/lib/format-date";
import {
  describeSubscriptionStatus,
  effectiveStatus,
  hasProductAccess,
} from "@/lib/subscription";
import type { AdminUser } from "@/lib/admin";

type ResetMode = "generate" | "manual";

function DetailItem({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="admin-detail-item">
      <dt>{label}</dt>
      <dd suppressHydrationWarning>{children}</dd>
    </div>
  );
}

export function AdminUsersTable({ users }: { users: AdminUser[] }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
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

  const filtered = users.filter((user) => {
    if (filter === "unverified" && user.emailVerifiedAt) return false;
    if (filter === "admins" && !user.isAdmin) return false;
    if (filter === "no_org" && user.organizationId) return false;
    if (filter === "never_signed_in" && user.lastSignInAt) return false;

    if (!query) return true;

    return [
      user.name,
      user.email,
      user.phone ?? "",
      user.organizationName ?? "",
    ].some((value) => value.toLowerCase().includes(query));
  });

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
      setCopied(false);
    }
  };

  return (
    <div className="dash-stack">
      <div className="admin-toolbar">
        <div className="auth-field">
          <label className="auth-label" htmlFor="user-search">
            Search
          </label>
          <input
            className="auth-input"
            id="user-search"
            type="text"
            placeholder="Search by name, email, phone or organization"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div className="auth-field admin-toolbar-filter">
          <label className="auth-label" htmlFor="user-filter">
            Show
          </label>
          <select
            className="auth-input"
            id="user-filter"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          >
            <option value="all">All users</option>
            <option value="unverified">Unverified email</option>
            <option value="admins">Admins</option>
            <option value="no_org">No organization</option>
            <option value="never_signed_in">Never signed in</option>
          </select>
        </div>
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
          <p className="dash-card-note">No users match.</p>
        ) : (
          <div className="dash-table-wrap">
            <table className="dash-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Phone</th>
                  <th>Organization</th>
                  <th>Email status</th>
                  <th>Last sign-in</th>
                  <th>Joined</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((user) => {
                  const isOpen = expandedId === user.id;
                  const orgStatus = user.organizationStatus
                    ? effectiveStatus(
                        user.organizationStatus,
                        user.organizationTrialEndsAt,
                      )
                    : null;

                  return (
                    <Fragment key={user.id}>
                      <tr>
                        <td>
                          <span className="admin-stack">
                            <span className="dash-user-name">
                              {user.name}
                              {user.isAdmin && (
                                <span className="admin-badge">Admin</span>
                              )}
                            </span>
                            <span className="admin-subline">{user.email}</span>
                          </span>
                        </td>
                        <td>{user.phone ?? "—"}</td>
                        <td>
                          {user.organizationName ? (
                            <span className="admin-stack">
                              <span>{user.organizationName}</span>
                              <span className="admin-subline">
                                {user.role}
                                {orgStatus
                                  ? ` · ${describeSubscriptionStatus(orgStatus)}`
                                  : ""}
                              </span>
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td>
                          {user.emailVerifiedAt ? (
                            <span className="admin-stack">
                              <span>Verified</span>
                              <span className="admin-subline">
                                {formatDate(user.emailVerifiedAt)}
                              </span>
                            </span>
                          ) : (
                            <span className="admin-badge">Unverified</span>
                          )}
                        </td>
                        <td suppressHydrationWarning>
                          {user.lastSignInAt ? (
                            <span className="admin-stack">
                              <span>{formatDateTime(user.lastSignInAt)}</span>
                              <span className="admin-subline">
                                {user.signInCount} sign-in
                                {user.signInCount === 1 ? "" : "s"}
                              </span>
                            </span>
                          ) : (
                            "Never"
                          )}
                        </td>
                        <td>{formatDate(user.createdAt)}</td>
                        <td>
                          <span className="admin-stack">
                            <button
                              className="dash-table-action"
                              type="button"
                              aria-expanded={isOpen}
                              onClick={() =>
                                setExpandedId(isOpen ? null : user.id)
                              }
                            >
                              {isOpen ? "Hide details" : "View details"}
                            </button>
                            <button
                              className="dash-table-action is-danger"
                              type="button"
                              onClick={() => openResetPanel(user)}
                            >
                              Reset password
                            </button>
                            {!user.emailVerifiedAt && (
                              <AdminVerifyEmailButton userId={user.id} />
                            )}
                          </span>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="admin-detail-row">
                          <td colSpan={7}>
                            <div className="admin-detail">
                              <dl className="admin-detail-grid">
                                <DetailItem label="Name">{user.name}</DetailItem>
                                <DetailItem label="Email">{user.email}</DetailItem>
                                <DetailItem label="Phone">
                                  {user.phone ?? "—"}
                                </DetailItem>
                                <DetailItem label="Email status">
                                  {user.emailVerifiedAt
                                    ? `Verified ${formatDateTime(user.emailVerifiedAt)}`
                                    : "Not verified yet"}
                                </DetailItem>
                                <DetailItem label="Two-factor">
                                  {user.twoFactorEnabledAt
                                    ? `On since ${formatDateTime(user.twoFactorEnabledAt)}`
                                    : "Off"}
                                </DetailItem>
                                <DetailItem label="Organization">
                                  {user.organizationName
                                    ? `${user.organizationName} (${user.role})`
                                    : "Not part of an organization"}
                                </DetailItem>
                                <DetailItem label="Subscription">
                                  {orgStatus
                                    ? `${describeSubscriptionStatus(orgStatus)} · desktop app ${hasProductAccess(orgStatus) ? "allowed" : "blocked"}`
                                    : "—"}
                                </DetailItem>
                                <DetailItem label="Joined">
                                  {formatDateTime(user.createdAt)}
                                </DetailItem>
                                <DetailItem label="Last sign-in">
                                  {user.lastSignInAt
                                    ? `${formatDateTime(user.lastSignInAt)} (${user.signInCount} total)`
                                    : "Never"}
                                </DetailItem>
                                <DetailItem label="Platform role">
                                  {user.isAdmin ? "Admin" : "Standard user"}
                                </DetailItem>
                                <DetailItem label="User ID">{user.id}</DetailItem>
                              </dl>

                              <div>
                                <p className="admin-detail-title">
                                  Recent activity
                                </p>
                                <AdminActivityList kind="user" id={user.id} />
                              </div>

                              <div className="admin-action-bar">
                                <button
                                  className="dash-table-action is-danger"
                                  type="button"
                                  onClick={() => openResetPanel(user)}
                                >
                                  Reset password
                                </button>
                                {user.twoFactorEnabledAt && (
                                  <AdminResetTwoFactorButton userId={user.id} />
                                )}
                                {!user.emailVerifiedAt && (
                                  <>
                                    <AdminVerifyEmailButton userId={user.id} />
                                    <AdminSendVerificationButton
                                      userId={user.id}
                                    />
                                  </>
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
