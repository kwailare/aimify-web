"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import {
  createPlanAction,
  setDefaultPlanAction,
  setPlanActiveAction,
  updatePlanAction,
  type PlanInput,
} from "@/lib/actions/admin-plans";
import type { AdminPlan } from "@/lib/admin";

type Notice = { kind: "error" | "success"; text: string } | null;

const naira = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  maximumFractionDigits: 0,
});

function limitText(value: number | null) {
  return value === null ? "Unlimited" : value.toLocaleString("en-US");
}

function toLimit(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();

  if (!text) return null;

  const number = Number(text);

  return Number.isFinite(number) ? number : Number.NaN;
}

function PlanForm({
  plan,
  busy,
  onSubmit,
  onCancel,
  submitLabel,
}: {
  plan: AdminPlan | null;
  busy: boolean;
  onSubmit: (input: PlanInput) => void;
  onCancel: () => void;
  submitLabel: string;
}) {
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    onSubmit({
      name: String(form.get("name") ?? ""),
      description: String(form.get("description") ?? ""),
      priceMonthly: Number(String(form.get("priceMonthly") ?? "").trim() || "0"),
      maxUsers: toLimit(form.get("maxUsers")),
      maxWarehouses: toLimit(form.get("maxWarehouses")),
      maxProducts: toLimit(form.get("maxProducts")),
    });
  };

  return (
    <form className="admin-clear-panel" onSubmit={handleSubmit}>
      <div className="admin-toolbar">
        <div className="auth-field">
          <label className="auth-label" htmlFor="plan-name">
            Plan name
          </label>
          <input
            className="auth-input"
            id="plan-name"
            name="name"
            defaultValue={plan?.name ?? ""}
            maxLength={60}
            required
          />
        </div>
        <div className="auth-field admin-toolbar-filter">
          <label className="auth-label" htmlFor="plan-price">
            Price per month (NGN)
          </label>
          <input
            className="auth-input"
            id="plan-price"
            name="priceMonthly"
            type="number"
            min="0"
            step="1"
            defaultValue={plan?.priceMonthly ?? 0}
            required
          />
        </div>
      </div>
      <div className="auth-field">
        <label className="auth-label" htmlFor="plan-description">
          Description (optional)
        </label>
        <input
          className="auth-input"
          id="plan-description"
          name="description"
          defaultValue={plan?.description ?? ""}
          maxLength={200}
        />
      </div>
      <div className="admin-toolbar">
        {(
          [
            ["maxUsers", "Team members", plan?.maxUsers],
            ["maxWarehouses", "Active warehouses", plan?.maxWarehouses],
            ["maxProducts", "Active products", plan?.maxProducts],
          ] as const
        ).map(([name, label, value]) => (
          <div className="auth-field" key={name}>
            <label className="auth-label" htmlFor={`plan-${name}`}>
              {label}
            </label>
            <input
              className="auth-input"
              id={`plan-${name}`}
              name={name}
              type="number"
              min="1"
              step="1"
              placeholder="Unlimited"
              defaultValue={value ?? ""}
            />
          </div>
        ))}
      </div>
      <div className="dash-inline-actions">
        <button className="auth-submit dash-submit" type="submit" disabled={busy}>
          {busy ? "Saving…" : submitLabel}
        </button>
        <button
          className="dash-table-action"
          type="button"
          disabled={busy}
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export function AdminPlansManager({ plans }: { plans: AdminPlan[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);

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
      return;
    }

    setEditing(null);
    setNotice({ kind: "success", text: successText });
    router.refresh();
  };

  const editingPlan =
    editing && editing !== "new"
      ? (plans.find((plan) => plan.id === editing) ?? null)
      : null;

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

      <div className="admin-stat-row">
        <span>
          {plans.length} {plans.length === 1 ? "plan" : "plans"}. New
          organizations start on the default plan.
        </span>
        {editing === null && (
          <button
            className="dash-table-action is-positive"
            type="button"
            onClick={() => {
              setNotice(null);
              setEditing("new");
            }}
          >
            New plan
          </button>
        )}
      </div>

      {editing === "new" && (
        <PlanForm
          plan={null}
          busy={busy === "create"}
          submitLabel="Create plan"
          onCancel={() => setEditing(null)}
          onSubmit={(input) =>
            run("create", () => createPlanAction(input), "Plan created.")
          }
        />
      )}

      {editingPlan && (
        <PlanForm
          key={editingPlan.id}
          plan={editingPlan}
          busy={busy === `save-${editingPlan.id}`}
          submitLabel="Save changes"
          onCancel={() => setEditing(null)}
          onSubmit={(input) =>
            run(
              `save-${editingPlan.id}`,
              () => updatePlanAction(editingPlan.id, input),
              `${input.name} saved.`,
            )
          }
        />
      )}

      <div className="dash-card">
        <div className="dash-table-wrap">
          <table className="dash-table">
            <thead>
              <tr>
                <th>Plan</th>
                <th>Price</th>
                <th>Team members</th>
                <th>Warehouses</th>
                <th>Products</th>
                <th>Organizations</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {plans.map((plan) => (
                <tr key={plan.id}>
                  <td>
                    <span className="admin-stack">
                      <span>
                        {plan.name}{" "}
                        {plan.isDefault && (
                          <span className="dash-badge is-active">Default</span>
                        )}{" "}
                        {!plan.isActive && (
                          <span className="dash-badge is-upcoming">
                            Inactive
                          </span>
                        )}
                      </span>
                      {plan.description && (
                        <span className="admin-subline">{plan.description}</span>
                      )}
                    </span>
                  </td>
                  <td>{naira.format(plan.priceMonthly)}</td>
                  <td>{limitText(plan.maxUsers)}</td>
                  <td>{limitText(plan.maxWarehouses)}</td>
                  <td>{limitText(plan.maxProducts)}</td>
                  <td>
                    <span className="admin-stack">
                      <span>{plan.organizationCount}</span>
                      <span className="admin-subline">
                        {plan.payingCount} paying
                      </span>
                    </span>
                  </td>
                  <td>
                    <span className="dash-inline-actions">
                      <button
                        className="dash-table-action"
                        type="button"
                        onClick={() => {
                          setNotice(null);
                          setEditing(plan.id);
                        }}
                      >
                        Edit
                      </button>
                      {!plan.isDefault && plan.isActive && (
                        <button
                          className="dash-table-action"
                          type="button"
                          disabled={busy !== null}
                          onClick={() =>
                            run(
                              `default-${plan.id}`,
                              () => setDefaultPlanAction(plan.id),
                              `${plan.name} is now the default plan.`,
                            )
                          }
                        >
                          Make default
                        </button>
                      )}
                      {!plan.isDefault && (
                        <button
                          className={`dash-table-action ${plan.isActive ? "is-danger" : "is-positive"}`}
                          type="button"
                          disabled={busy !== null}
                          onClick={() =>
                            run(
                              `active-${plan.id}`,
                              () => setPlanActiveAction(plan.id, !plan.isActive),
                              plan.isActive
                                ? `${plan.name} was deactivated.`
                                : `${plan.name} was activated.`,
                            )
                          }
                        >
                          {plan.isActive ? "Deactivate" : "Activate"}
                        </button>
                      )}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
