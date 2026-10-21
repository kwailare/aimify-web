"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  resetRolePermissionsAction,
  saveRolePermissionsAction,
} from "@/lib/actions/permissions";
import {
  PERMISSION_MODULES,
  normalizePermissions,
  withoutPermission,
  type EditablePermission,
} from "@/lib/permissions";

type Row = {
  role: string;
  permissions: string[];
  customized: boolean;
  defaults: string[];
};

type Notice = { kind: "error" | "success"; text: string } | null;

const sameSet = (a: Set<string>, b: Set<string>) =>
  a.size === b.size && [...a].every((key) => b.has(key));

export function PermissionsEditor({ canEdit, matrix }: { canEdit: boolean; matrix: Row[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState(matrix[0]?.role ?? "");
  const [drafts, setDrafts] = useState<Record<string, Set<string>>>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  const row = matrix.find((entry) => entry.role === selected);
  if (!row) return null;

  const saved = new Set(row.permissions);
  const draft = drafts[selected] ?? saved;
  const dirty = !sameSet(draft, saved);
  const matchesDefaults = sameSet(draft, new Set(row.defaults));

  const toggle = (key: EditablePermission) => {
    const next = draft.has(key)
      ? withoutPermission(draft, key)
      : normalizePermissions([...draft, key]);

    setDrafts({ ...drafts, [selected]: new Set(next) });
    setNotice(null);
  };

  const discard = () => {
    const rest = { ...drafts };
    delete rest[selected];
    setDrafts(rest);
    setNotice(null);
  };

  const save = async () => {
    setBusy(true);
    const result = await saveRolePermissionsAction(selected, [...draft]);
    setBusy(false);
    if ("error" in result && result.error) {
      setNotice({ kind: "error", text: result.error });
      return;
    }
    discard();
    setNotice({ kind: "success", text: `Saved. ${selected} permissions apply from their next action.` });
    router.refresh();
  };

  const reset = async () => {
    setBusy(true);
    const result = await resetRolePermissionsAction(selected);
    setBusy(false);
    if ("error" in result && result.error) {
      setNotice({ kind: "error", text: result.error });
      return;
    }
    discard();
    setNotice({ kind: "success", text: `${selected} is back to the default permissions.` });
    router.refresh();
  };

  const switchRole = (role: string) => {
    setSelected(role);
    setNotice(null);
  };

  return (
    <div className="dash-card perm-card">
      <div className="perm-tabs" role="tablist" aria-label="Role">
        {matrix.map((entry) => (
          <button
            key={entry.role}
            type="button"
            role="tab"
            aria-selected={entry.role === selected}
            className={`perm-tab${entry.role === selected ? " is-active" : ""}`}
            onClick={() => switchRole(entry.role)}
          >
            {entry.role}
            {entry.customized ? <span className="perm-tab-dot" title="Customised" /> : null}
            {drafts[entry.role] && !sameSet(drafts[entry.role], new Set(entry.permissions)) ? " *" : ""}
          </button>
        ))}
      </div>

      <p className="dash-card-note">
        {row.customized
          ? `${row.role} has custom permissions for your organization.`
          : `${row.role} uses Aimify's default permissions.`}{" "}
        Ticking an action also ticks what it needs to see (recording stock needs products and
        warehouses); unticking a View removes the actions that depend on it.
      </p>

      <div className="perm-grid" role="tabpanel" aria-label={`${row.role} permissions`}>
        {PERMISSION_MODULES.map((group) => (
          <div key={group.module} className="perm-row">
            <div className="perm-module">{group.label}</div>
            <div className="perm-actions">
              {group.actions.map((action) => (
                <label key={action.key} className="perm-check">
                  <input
                    type="checkbox"
                    name={action.key}
                    checked={draft.has(action.key)}
                    disabled={!canEdit || busy}
                    onChange={() => toggle(action.key)}
                  />
                  {action.label}
                </label>
              ))}
            </div>
          </div>
        ))}
        <div className="perm-row">
          <div className="perm-module">Team &amp; setup</div>
          <div className="perm-actions perm-fixed">
            {row.role === "Administrator"
              ? "Invites people and runs the guided setup. Always on for Administrators."
              : "Not available to this role. Only Owners and Administrators manage the team."}
          </div>
        </div>
      </div>

      {notice ? (
        <p
          className={notice.kind === "error" ? "auth-error" : "auth-success"}
          role={notice.kind === "error" ? "alert" : "status"}
        >
          {notice.text}
        </p>
      ) : null}

      {canEdit ? (
        <div className="dash-inline-actions perm-buttons">
          <button type="button" className="auth-submit dash-submit" disabled={!dirty || busy} onClick={save}>
            {busy ? "Saving…" : "Save changes"}
          </button>
          {dirty ? (
            <button type="button" className="dash-table-action" disabled={busy} onClick={discard}>
              Discard changes
            </button>
          ) : null}
          {row.customized && !dirty ? (
            <button type="button" className="dash-table-action is-danger" disabled={busy} onClick={reset}>
              Reset to defaults
            </button>
          ) : null}
          {dirty && matchesDefaults ? (
            <span className="dash-card-note">These match the defaults.</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
