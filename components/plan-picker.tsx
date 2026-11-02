"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { changePlanAction, quotePlanChangeAction } from "@/lib/actions/billing";

export type PlanOption = {
  id: string;
  name: string;
  description: string | null;
  priceMonthly: number;
  limits: { users: number | null; warehouses: number | null; products: number | null };
};

type Quote = Extract<Awaited<ReturnType<typeof quotePlanChangeAction>>, { quote: unknown }>["quote"];
type Notice = { kind: "error" | "success"; text: string } | null;

const naira = (n: number) => `₦${n.toLocaleString("en-US")}`;
const longDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Lagos" });
const limitText = (n: number | null, one: string, many: string) =>
  n === null ? `Unlimited ${many}` : `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

/**
 * Every plan on offer, with the current one marked and a cheaper one
 * waiting for the end of the period shown as such. The Owner picks one,
 * sees what it means (pay the difference now, start at the end of the
 * period, or switch now) and any limits they're already over, then
 * confirms.
 */
export function PlanPicker({
  plans,
  currentPlanId,
  scheduled,
  isOwner,
}: {
  plans: PlanOption[];
  currentPlanId: string | null;
  scheduled: { planId: string; at: string } | null;
  isOwner: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [choice, setChoice] = useState<{ planId: string; quote: Quote } | null>(null);
  const [declined, setDeclined] = useState<string | null>(null);

  const choose = async (planId: string) => {
    setNotice(null);
    setDeclined(null);
    setBusy(`quote:${planId}`);
    const result = await quotePlanChangeAction(planId);
    setBusy(null);
    if ("error" in result && result.error) {
      setNotice({ kind: "error", text: result.error });
      return;
    }
    if ("quote" in result && result.quote) setChoice({ planId, quote: result.quote });
  };

  const confirm = async (checkout = false) => {
    if (!choice) return;
    setNotice(null);
    setBusy("confirm");
    const result = await changePlanAction(choice.planId, { checkout });
    if ("error" in result && result.error) {
      setBusy(null);
      setNotice({ kind: "error", text: result.error });
      return;
    }
    if (!("status" in result)) {
      setBusy(null);
      return;
    }
    switch (result.status) {
      case "checkout":
        window.location.href = result.url;
        return;
      case "declined":
        setBusy(null);
        setDeclined(result.reason);
        return;
      case "upgraded":
        setNotice({ kind: "success", text: `You're now on ${result.plan}. We charged ${naira(result.amount)} to your saved card.` });
        break;
      case "switched":
        setNotice({ kind: "success", text: `You're now on ${result.plan}.` });
        break;
      case "scheduled":
        setNotice({ kind: "success", text: `${result.plan} starts on ${longDate(result.at)}.` });
        break;
      case "kept":
        setNotice({ kind: "success", text: `You'll stay on ${result.plan}.` });
        break;
      default:
        break;
    }
    setBusy(null);
    setChoice(null);
    setDeclined(null);
    router.refresh();
  };

  const scheduledPlan = scheduled ? plans.find((p) => p.id === scheduled.planId) : null;

  return (
    <div className="dash-stack">
      {notice && (
        <p className={notice.kind === "error" ? "auth-error" : "auth-success"} role={notice.kind === "error" ? "alert" : "status"}>
          {notice.text}
        </p>
      )}

      {scheduledPlan && scheduled && (
        <div className="dash-inline-actions">
          <span className="admin-subline">
            You move to {scheduledPlan.name} on {longDate(scheduled.at)}, when the period you&apos;ve paid for ends.
          </span>
          {isOwner && currentPlanId && (
            <button
              className="dash-table-action is-positive"
              type="button"
              disabled={busy !== null}
              onClick={() => choose(currentPlanId)}
            >
              Keep my current plan
            </button>
          )}
        </div>
      )}

      <div className="dash-grid plan-options">
        {plans.map((plan) => {
          const current = plan.id === currentPlanId;
          const upcoming = plan.id === scheduled?.planId;
          return (
            <div className={`plan-option${current ? " is-current" : ""}`} key={plan.id} data-plan={plan.name}>
              <div>
                <p className="plan-summary-name">{plan.name}</p>
                {plan.description && <p className="plan-summary-note">{plan.description}</p>}
              </div>
              <p className="plan-summary-price">
                {naira(plan.priceMonthly)}
                <span>/ month</span>
              </p>
              <ul className="plan-option-limits">
                <li>{limitText(plan.limits.users, "team member", "team members")}</li>
                <li>{limitText(plan.limits.warehouses, "warehouse", "warehouses")}</li>
                <li>{limitText(plan.limits.products, "product", "products")}</li>
              </ul>
              {current ? (
                <span className="dash-badge is-active">Your plan</span>
              ) : upcoming ? (
                <span className="dash-badge is-upcoming">Starts {longDate(scheduled!.at)}</span>
              ) : isOwner ? (
                <button
                  className="dash-table-action"
                  type="button"
                  disabled={busy !== null}
                  onClick={() => choose(plan.id)}
                >
                  {busy === `quote:${plan.id}` ? "Working…" : `Choose ${plan.name}`}
                </button>
              ) : null}
            </div>
          );
        })}
      </div>

      {!isOwner && <p className="dash-empty">Only the Owner can change the plan.</p>}

      {choice && (
        <div className="plan-confirm" role="dialog" aria-label={`Change to ${choice.quote.target}`}>
          <p className="plan-summary-name">
            {choice.quote.kind === "same" ? `Stay on ${choice.quote.target}` : `Change to ${choice.quote.target}`}
          </p>
          <p className="plan-confirm-text">{explain(choice.quote)}</p>
          {choice.quote.overLimits.length > 0 && (
            <ul className="plan-confirm-warnings">
              {choice.quote.overLimits.map((o) => (
                <li key={o.key}>
                  You have {o.used.toLocaleString("en-US")} {o.label}; {choice.quote.target} allows {o.limit.toLocaleString("en-US")}. Nothing
                  is removed, but you can&apos;t add more until you&apos;re under the limit.
                </li>
              ))}
            </ul>
          )}
          {declined && (
            <p className="auth-error" role="alert">
              Your card was declined ({declined}). You can pay another way instead.
            </p>
          )}
          <div className="dash-inline-actions">
            <button className="auth-submit dash-submit" type="button" disabled={busy !== null} onClick={() => confirm(Boolean(declined))}>
              {busy === "confirm" ? "Working…" : confirmLabel(choice.quote, Boolean(declined))}
            </button>
            <button
              className="dash-table-action"
              type="button"
              disabled={busy !== null}
              onClick={() => {
                setChoice(null);
                setDeclined(null);
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function explain(q: Quote) {
  switch (q.kind) {
    case "same":
      return q.scheduled
        ? `You won't move to ${q.scheduled.plan}; ${q.target} keeps renewing at ${naira(q.targetPrice)} a month.`
        : `You're already on ${q.target}.`;
    case "switch":
      return `${q.target} starts now. Your payments are ${naira(q.targetPrice)} a month from the next one.`;
    case "upgrade":
      return `${q.target} starts now. You pay ${naira(q.amountDue)} today for the ${q.daysLeft} day${q.daysLeft === 1 ? "" : "s"} left in this period${q.hasCard ? ", charged to your saved card" : ""}. From ${longDate(q.periodEnd!)} it renews at ${naira(q.targetPrice)} a month.`;
    case "downgrade":
      return `You keep ${q.current} until ${longDate(q.effectiveAt!)}, the end of the period you've paid for. ${q.target} then renews at ${naira(q.targetPrice)} a month. Nothing is refunded.`;
  }
}

function confirmLabel(q: Quote, payAnotherWay: boolean) {
  switch (q.kind) {
    case "same":
      return `Keep ${q.target}`;
    case "upgrade":
      return payAnotherWay || !q.hasCard ? `Pay ${naira(q.amountDue)} with Paystack` : `Pay ${naira(q.amountDue)} and upgrade`;
    case "downgrade":
      return `Move to ${q.target} on ${longDate(q.effectiveAt!)}`;
    default:
      return `Switch to ${q.target}`;
  }
}
