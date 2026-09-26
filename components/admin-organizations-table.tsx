"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { Fragment, useState } from "react";
import { AdminActivityList } from "@/components/admin-activity-list";
import { OrgActionButton } from "@/components/org-action-button";
import {
  activateSubscriptionAction,
  extendTrialAction,
} from "@/lib/actions/admin";
import type { AdminOrganization } from "@/lib/admin";
import { formatDate, formatDateTime } from "@/lib/format-date";
import {
  describeSubscriptionStatus,
  effectiveStatus,
  hasProductAccess,
} from "@/lib/subscription";

const STATUS_FILTERS = [
  "trial",
  "active",
  "expired",
  "cancelled",
  "suspended",
  "pending",
  "past_due",
];

const ACTIVATABLE = ["pending", "trial", "expired", "cancelled", "past_due"];

type Notice = { orgId: string; kind: "error" | "success"; text: string } | null;

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="admin-detail-item">
      <dt>{label}</dt>
      <dd>{value || "—"}</dd>
    </div>
  );
}

function trialNote(org: AdminOrganization, status: string) {
  if (!org.trialEndsAt) return null;
  if (status === "trial") return `Trial ends ${formatDate(org.trialEndsAt)}`;
  if (status === "expired") return `Trial ended ${formatDate(org.trialEndsAt)}`;
  return null;
}

export function AdminOrganizationsTable({
  organizations,
}: {
  organizations: AdminOrganization[];
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [extendDays, setExtendDays] = useState("14");
  const [confirmActivate, setConfirmActivate] = useState<string | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);

  const query = search.trim().toLowerCase();

  const filtered = organizations.filter((org) => {
    const status = effectiveStatus(org.subscriptionStatus, org.trialEndsAt);

    if (statusFilter !== "all" && status !== statusFilter) return false;
    if (!query) return true;

    return [
      org.name,
      org.industry ?? "",
      org.email ?? "",
      org.owner?.name ?? "",
      org.owner?.email ?? "",
    ].some((value) => value.toLowerCase().includes(query));
  });

  const run = async (
    orgId: string,
    key: string,
    action: () => Promise<{ error?: string; success?: boolean }>,
    successText: string,
  ) => {
    setNotice(null);
    setPendingKey(key);

    const result = await action();

    setPendingKey(null);
    setConfirmActivate(null);

    if (result?.error) {
      setNotice({ orgId, kind: "error", text: result.error });
      return;
    }

    setNotice({ orgId, kind: "success", text: successText });
    router.refresh();
  };

  return (
    <div className="dash-stack">
      <div className="admin-toolbar">
        <div className="auth-field">
          <label className="auth-label" htmlFor="org-search">
            Search
          </label>
          <input
            className="auth-input"
            id="org-search"
            type="text"
            placeholder="Search by organization, owner or email"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div className="auth-field admin-toolbar-filter">
          <label className="auth-label" htmlFor="org-status-filter">
            Status
          </label>
          <select
            className="auth-input"
            id="org-status-filter"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="all">All statuses</option>
            {STATUS_FILTERS.map((status) => (
              <option key={status} value={status}>
                {describeSubscriptionStatus(status)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="dash-card">
        {filtered.length === 0 ? (
          <p className="dash-card-note">No organizations match.</p>
        ) : (
          <div className="dash-table-wrap">
            <table className="dash-table">
              <thead>
                <tr>
                  <th>Organization</th>
                  <th>Owner</th>
                  <th>Subscription</th>
                  <th>Usage</th>
                  <th>Last activity</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((org) => {
                  const status = effectiveStatus(
                    org.subscriptionStatus,
                    org.trialEndsAt,
                  );
                  const isOpen = expandedId === org.id;
                  const note = trialNote(org, status);
                  const orgNotice = notice?.orgId === org.id ? notice : null;

                  return (
                    <Fragment key={org.id}>
                      <tr>
                        <td>
                          <div className="admin-cell-main">
                            <span className="admin-org-logo" aria-hidden="true">
                              {org.logoUrl ? (
                                <Image
                                  src={org.logoUrl}
                                  alt=""
                                  width={64}
                                  height={64}
                                  unoptimized
                                />
                              ) : (
                                org.name.charAt(0).toUpperCase()
                              )}
                            </span>
                            <span className="admin-stack">
                              <strong>{org.name}</strong>
                              <span className="admin-subline">
                                {[org.industry, org.currency]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </span>
                            </span>
                          </div>
                        </td>
                        <td>
                          {org.owner ? (
                            <span className="admin-stack">
                              <span>{org.owner.name}</span>
                              <span className="admin-subline">
                                {org.owner.email}
                              </span>
                              {org.memberCount > 1 && (
                                <span className="admin-subline">
                                  +{org.memberCount - 1} more
                                </span>
                              )}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td>
                          <span className="admin-stack">
                            <span
                              className={`dash-badge ${
                                hasProductAccess(status)
                                  ? "is-active"
                                  : "is-upcoming"
                              }`}
                            >
                              {describeSubscriptionStatus(status)}
                            </span>
                            {note && (
                              <span className="admin-subline">{note}</span>
                            )}
                          </span>
                        </td>
                        <td>
                          <span className="admin-stack">
                            <span>
                              {org.memberCount} member
                              {org.memberCount === 1 ? "" : "s"} ·{" "}
                              {org.warehouseCount} warehouse
                              {org.warehouseCount === 1 ? "" : "s"}
                            </span>
                            <span className="admin-subline">
                              {org.productCount} product
                              {org.productCount === 1 ? "" : "s"} ·{" "}
                              {org.movementCount} stock movement
                              {org.movementCount === 1 ? "" : "s"}
                            </span>
                          </span>
                        </td>
                        <td suppressHydrationWarning>
                          {org.lastActivityAt
                            ? formatDateTime(org.lastActivityAt)
                            : "—"}
                        </td>
                        <td>{formatDate(org.createdAt)}</td>
                        <td>
                          <span className="admin-stack">
                            <button
                              className="dash-table-action"
                              type="button"
                              aria-expanded={isOpen}
                              onClick={() =>
                                setExpandedId(isOpen ? null : org.id)
                              }
                            >
                              {isOpen ? "Hide details" : "View details"}
                            </button>
                            <OrgActionButton
                              organizationId={org.id}
                              status={status}
                            />
                          </span>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="admin-detail-row">
                          <td colSpan={7}>
                            <div className="admin-detail">
                              <div>
                                <p className="admin-detail-title">Company</p>
                                <dl className="admin-detail-grid">
                                  <Field label="Name" value={org.name} />
                                  <Field
                                    label="Registration number"
                                    value={org.registrationNumber}
                                  />
                                  <Field label="Industry" value={org.industry} />
                                  <Field label="Address" value={org.address} />
                                  <Field label="Phone" value={org.phone} />
                                  <Field label="Email" value={org.email} />
                                  <Field
                                    label="Tax"
                                    value={
                                      org.taxRate
                                        ? `${org.taxName ?? "Tax"} ${org.taxRate}%`
                                        : org.taxName
                                    }
                                  />
                                  <Field
                                    label="Currency"
                                    value={org.currency}
                                  />
                                  <Field
                                    label="Time zone"
                                    value={org.timezone}
                                  />
                                  <Field
                                    label="Date format"
                                    value={org.dateFormat}
                                  />
                                  <Field
                                    label="Created"
                                    value={
                                      <span suppressHydrationWarning>
                                        {formatDateTime(org.createdAt)}
                                      </span>
                                    }
                                  />
                                  <Field label="Organization ID" value={org.id} />
                                </dl>
                              </div>

                              <div>
                                <p className="admin-detail-title">
                                  Subscription
                                </p>
                                <dl className="admin-detail-grid">
                                  <Field
                                    label="Status"
                                    value={describeSubscriptionStatus(status)}
                                  />
                                  <Field label="Plan" value="Full Access" />
                                  <Field
                                    label="Trial ends"
                                    value={
                                      org.trialEndsAt
                                        ? formatDate(org.trialEndsAt)
                                        : null
                                    }
                                  />
                                  <Field
                                    label="Desktop app access"
                                    value={
                                      hasProductAccess(status)
                                        ? "Allowed"
                                        : "Blocked"
                                    }
                                  />
                                </dl>
                              </div>

                              <div>
                                <p className="admin-detail-title">
                                  Members ({org.memberCount})
                                </p>
                                {org.members.length === 0 ? (
                                  <p className="admin-subline">No members.</p>
                                ) : (
                                  <div className="dash-table-wrap">
                                    <table className="admin-mini-table">
                                      <thead>
                                        <tr>
                                          <th>Name</th>
                                          <th>Email</th>
                                          <th>Role</th>
                                          <th>Email status</th>
                                          <th>Joined</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {org.members.map((member) => (
                                          <tr key={member.userId}>
                                            <td>{member.name}</td>
                                            <td>{member.email}</td>
                                            <td>{member.role}</td>
                                            <td>
                                              {member.emailVerifiedAt
                                                ? "Verified"
                                                : "Unverified"}
                                            </td>
                                            <td>{formatDate(member.joinedAt)}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                              </div>

                              <div>
                                <p className="admin-detail-title">
                                  Recent activity
                                </p>
                                <AdminActivityList
                                  kind="organization"
                                  id={org.id}
                                />
                              </div>

                              <div className="admin-action-bar">
                                {(status === "trial" || status === "expired") && (
                                  <>
                                    <label
                                      className="auth-label"
                                      htmlFor={`extend-${org.id}`}
                                    >
                                      Extend trial by
                                    </label>
                                    <select
                                      className="auth-input"
                                      id={`extend-${org.id}`}
                                      value={extendDays}
                                      onChange={(event) =>
                                        setExtendDays(event.target.value)
                                      }
                                    >
                                      <option value="7">7 days</option>
                                      <option value="14">14 days</option>
                                      <option value="30">30 days</option>
                                    </select>
                                    <button
                                      className="dash-table-action is-positive"
                                      type="button"
                                      disabled={pendingKey !== null}
                                      onClick={() =>
                                        run(
                                          org.id,
                                          `extend-${org.id}`,
                                          () =>
                                            extendTrialAction(
                                              org.id,
                                              Number(extendDays),
                                            ),
                                          `Trial extended by ${extendDays} days.`,
                                        )
                                      }
                                    >
                                      {pendingKey === `extend-${org.id}`
                                        ? "Working…"
                                        : "Extend trial"}
                                    </button>
                                  </>
                                )}
                                {ACTIVATABLE.includes(status) &&
                                  (confirmActivate === org.id ? (
                                    <>
                                      <span className="admin-subline">
                                        Mark {org.name} as active without a
                                        payment?
                                      </span>
                                      <button
                                        className="dash-table-action is-positive"
                                        type="button"
                                        disabled={pendingKey !== null}
                                        onClick={() =>
                                          run(
                                            org.id,
                                            `activate-${org.id}`,
                                            () =>
                                              activateSubscriptionAction(org.id),
                                            "Subscription activated.",
                                          )
                                        }
                                      >
                                        {pendingKey === `activate-${org.id}`
                                          ? "Working…"
                                          : "Yes, activate"}
                                      </button>
                                      <button
                                        className="dash-table-action"
                                        type="button"
                                        onClick={() => setConfirmActivate(null)}
                                      >
                                        Cancel
                                      </button>
                                    </>
                                  ) : (
                                    <button
                                      className="dash-table-action is-positive"
                                      type="button"
                                      onClick={() => setConfirmActivate(org.id)}
                                    >
                                      Activate subscription
                                    </button>
                                  ))}
                                {orgNotice && (
                                  <span
                                    className={
                                      orgNotice.kind === "error"
                                        ? "auth-error"
                                        : "auth-success"
                                    }
                                    role={
                                      orgNotice.kind === "error"
                                        ? "alert"
                                        : "status"
                                    }
                                  >
                                    {orgNotice.text}
                                  </span>
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
