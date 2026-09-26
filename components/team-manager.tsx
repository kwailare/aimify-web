"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import {
  changeMemberRoleAction,
  inviteMemberAction,
  removeMemberAction,
  resendInvitationAction,
  revokeInvitationAction,
} from "@/lib/actions/team";
import { formatDate } from "@/lib/format-date";
import { canChangeMember, type Role } from "@/lib/roles";

type Member = {
  userId: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  joinedAt: string;
};

type PendingInvitation = {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
  createdAt: string;
  invitedByName: string | null;
};

type Notice = { kind: "error" | "success"; text: string } | null;

export function TeamManager({
  currentUserId,
  currentRole,
  canManage,
  assignable,
  members,
  invitations,
}: {
  currentUserId: string;
  currentRole: string;
  canManage: boolean;
  assignable: Role[];
  members: Member[];
  invitations: PendingInvitation[];
}) {
  const router = useRouter();
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [inviteRole, setInviteRole] = useState<string>(
    assignable.find((role) => role !== "Owner" && role !== "Administrator") ??
      assignable[0] ??
      "",
  );
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  const run = async (
    key: string,
    action: () => Promise<{ error?: string; success?: boolean }>,
    successText: string,
  ) => {
    setNotice(null);
    setBusy(key);

    const result = await action();

    setBusy(null);

    if (result?.error) {
      setNotice({ kind: "error", text: result.error });
      router.refresh();
      return false;
    }

    setNotice({ kind: "success", text: successText });
    router.refresh();
    return true;
  };

  const handleInvite = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const email = String(new FormData(form).get("email") ?? "");

    const ok = await run(
      "invite",
      () => inviteMemberAction(email, inviteRole),
      `Invitation sent to ${email.trim().toLowerCase()}.`,
    );

    if (ok) form.reset();
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

      {canManage && (
        <form className="dash-card dash-form" onSubmit={handleInvite}>
          <p className="dash-card-label">Invite a teammate</p>
          <div className="admin-toolbar">
            <div className="auth-field">
              <label className="auth-label" htmlFor="invite-email-input">
                Email address
              </label>
              <input
                className="auth-input"
                id="invite-email-input"
                name="email"
                type="email"
                placeholder="teammate@company.com"
                required
              />
            </div>
            <div className="auth-field admin-toolbar-filter">
              <label className="auth-label" htmlFor="invite-role-select">
                Role
              </label>
              <select
                className="auth-input"
                id="invite-role-select"
                value={inviteRole}
                onChange={(event) => setInviteRole(event.target.value)}
              >
                {assignable.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="dash-inline-actions">
            <button
              className="auth-submit dash-submit"
              type="submit"
              disabled={busy === "invite"}
            >
              {busy === "invite" ? "Sending…" : "Send invitation"}
            </button>
          </div>
          <p className="dash-card-note">
            They get an email with a link that works for 7 days. Someone who
            already belongs to another organization can&apos;t be invited.
          </p>
        </form>
      )}

      <div className="dash-card">
        <div className="admin-stat-row">
          <p className="dash-card-label">Members</p>
          <span className="admin-subline">
            {members.length} {members.length === 1 ? "person" : "people"}
          </span>
        </div>
        <div className="dash-table-wrap">
          <table className="dash-table">
            <thead>
              <tr>
                <th>Person</th>
                <th>Phone</th>
                <th>Role</th>
                <th>Joined</th>
                {canManage && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {members.map((member) => {
                const isSelf = member.userId === currentUserId;
                const editable =
                  canManage && !isSelf && canChangeMember(currentRole, member.role);

                return (
                  <tr key={member.userId}>
                    <td>
                      <span className="admin-stack">
                        <span>
                          {member.name}
                          {isSelf ? " (you)" : ""}
                        </span>
                        <span className="admin-subline">{member.email}</span>
                      </span>
                    </td>
                    <td>{member.phone ?? "—"}</td>
                    <td>
                      {editable ? (
                        <select
                          className="auth-input"
                          aria-label={`Role for ${member.name}`}
                          value={member.role}
                          disabled={busy === `role:${member.userId}`}
                          onChange={(event) =>
                            run(
                              `role:${member.userId}`,
                              () =>
                                changeMemberRoleAction(
                                  member.userId,
                                  event.target.value,
                                ),
                              `${member.name} is now ${event.target.value}.`,
                            )
                          }
                        >
                          {Array.from(
                            new Set([member.role, ...assignable]),
                          ).map((role) => (
                            <option key={role} value={role}>
                              {role}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="dash-badge is-upcoming">
                          {member.role}
                        </span>
                      )}
                    </td>
                    <td suppressHydrationWarning>
                      {formatDate(member.joinedAt)}
                    </td>
                    {canManage && (
                      <td>
                        {editable ? (
                          confirmRemove === member.userId ? (
                            <span className="dash-inline-actions">
                              <button
                                className="dash-table-action is-danger"
                                type="button"
                                disabled={busy === `remove:${member.userId}`}
                                onClick={async () => {
                                  await run(
                                    `remove:${member.userId}`,
                                    () => removeMemberAction(member.userId),
                                    `${member.name} was removed from the team.`,
                                  );
                                  setConfirmRemove(null);
                                }}
                              >
                                Confirm remove
                              </button>
                              <button
                                className="dash-table-action"
                                type="button"
                                onClick={() => setConfirmRemove(null)}
                              >
                                Cancel
                              </button>
                            </span>
                          ) : (
                            <button
                              className="dash-table-action is-danger"
                              type="button"
                              onClick={() => setConfirmRemove(member.userId)}
                            >
                              Remove
                            </button>
                          )
                        ) : (
                          <span className="admin-subline">—</span>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {canManage && (
        <div className="dash-card">
          <div className="admin-stat-row">
            <p className="dash-card-label">Pending invitations</p>
            <span className="admin-subline">{invitations.length} waiting</span>
          </div>
          {invitations.length === 0 ? (
            <p className="dash-card-note">
              No invitations are waiting. Invited people appear here until they
              accept.
            </p>
          ) : (
            <div className="dash-table-wrap">
              <table className="dash-table">
                <thead>
                  <tr>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Invited by</th>
                    <th>Expires</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {invitations.map((invitation) => (
                    <tr key={invitation.id}>
                      <td>{invitation.email}</td>
                      <td>
                        <span className="dash-badge is-upcoming">
                          {invitation.role}
                        </span>
                      </td>
                      <td>{invitation.invitedByName ?? "—"}</td>
                      <td suppressHydrationWarning>
                        {formatDate(invitation.expiresAt)}
                      </td>
                      <td>
                        <span className="dash-inline-actions">
                          <button
                            className="dash-table-action"
                            type="button"
                            disabled={busy === `resend:${invitation.id}`}
                            onClick={() =>
                              run(
                                `resend:${invitation.id}`,
                                () => resendInvitationAction(invitation.id),
                                `A fresh invitation was sent to ${invitation.email}.`,
                              )
                            }
                          >
                            Resend
                          </button>
                          <button
                            className="dash-table-action is-danger"
                            type="button"
                            disabled={busy === `revoke:${invitation.id}`}
                            onClick={() =>
                              run(
                                `revoke:${invitation.id}`,
                                () => revokeInvitationAction(invitation.id),
                                `The invitation to ${invitation.email} was revoked.`,
                              )
                            }
                          >
                            Revoke
                          </button>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div className="dash-card">
        <p className="dash-card-label">What each role is for</p>
        <ul className="admin-feed">
          <li>
            <span className="admin-stack">
              <span>Owner</span>
              <span className="admin-subline">
                Full control, including cancelling the subscription and changing Owners and Administrators.
              </span>
            </span>
          </li>
          <li>
            <span className="admin-stack">
              <span>Administrator</span>
              <span className="admin-subline">
                Manages the team and settings. Can&apos;t change Owners or other Administrators.
              </span>
            </span>
          </li>
          <li>
            <span className="admin-stack">
              <span>Warehouse Manager, Sales Staff, Inventory Staff, Accountant / Finance</span>
              <span className="admin-subline">
                Day-to-day roles that sign in to the desktop app and can&apos;t change organization settings.
              </span>
            </span>
          </li>
        </ul>
      </div>
    </div>
  );
}
