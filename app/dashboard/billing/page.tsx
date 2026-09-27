import { desc, eq } from "drizzle-orm";
import { Check } from "lucide-react";
import { redirect } from "next/navigation";
import { BillingControls } from "@/components/billing-controls";
import { CancelSubscriptionButton } from "@/components/cancel-subscription-button";
import { db } from "@/db";
import { payments } from "@/db/schema";
import { getOrgPlan, getUsage, limitFor, type LimitKey } from "@/lib/plans";
import { formatDate } from "@/lib/format-date";
import { getPaymentMethod } from "@/lib/billing";
import { getOrgContext } from "@/lib/org";
import { canManageTeam } from "@/lib/roles";
import {
  canCancelSubscription,
  describeSubscriptionStatus,
} from "@/lib/subscription";

const planFeatures = [
  "Real-time inventory across your warehouse",
  "Purchases, sales & automatic stock updates",
  "Customer credit & debt tracking",
  "WhatsApp alerts & repayment reminders",
  "Full audit trail on every transaction",
];

function planNote(status: string, trialEndsAt: Date | null) {
  switch (status) {
    case "trial":
      return "14-day free trial · billed monthly after";
    case "active":
      return "Billed monthly";
    case "past_due":
      return "Payment overdue";
    case "expired":
      return trialEndsAt
        ? `Free trial ended ${formatDate(trialEndsAt)}`
        : "Free trial ended";
    case "cancelled":
      return "Subscription cancelled";
    default:
      return describeSubscriptionStatus(status);
  }
}

function paymentBadgeClass(status: string) {
  return status === "succeeded" ? "is-active" : "is-upcoming";
}

const PAYMENT_NOTICES: Record<string, { kind: "success" | "error"; text: string }> = {
  success: { kind: "success", text: "Payment received. Thank you, your subscription is active." },
  pending: { kind: "success", text: "Your payment is still being confirmed. This page updates as soon as Paystack confirms it." },
  failed: { kind: "error", text: "The payment didn't go through, so you haven't been charged. You can try again." },
  missing: { kind: "error", text: "We couldn't find that payment." },
};

function daysUntil(date: Date) {
  return Math.ceil((date.getTime() - Date.now()) / 86400000);
}

function formatLong(date: Date) {
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Africa/Lagos",
  });
}

export default async function DashboardBillingPage({
  searchParams,
}: {
  searchParams: Promise<{ payment?: string }>;
}) {
  const { payment: paymentResult } = await searchParams;
  const context = await getOrgContext();

  if (!context?.membership) {
    redirect("/signin");
  }

  const { organization, role } = context.membership;
  const method = await getPaymentMethod(organization.id);
  const canPay = canManageTeam(role);

  const history = await db
    .select()
    .from(payments)
    .where(eq(payments.organizationId, organization.id))
    .orderBy(desc(payments.createdAt))
    .limit(50);

  const [plan, usage] = await Promise.all([
    getOrgPlan(organization.id),
    getUsage(organization.id),
  ]);
  const usageRows: { key: LimitKey; label: string; used: number }[] = [
    { key: "users", label: "Team members", used: usage.users },
    { key: "warehouses", label: "Active warehouses", used: usage.warehouses },
    { key: "products", label: "Active products", used: usage.products },
  ];

  const status = organization.subscriptionStatus;
  const periodEnd = organization.currentPeriodEnd;
  const daysToRenewal = periodEnd ? daysUntil(periodEnd) : null;
  const showPay =
    status !== "suspended" &&
    (status !== "active" ||
      !periodEnd ||
      (daysToRenewal !== null && daysToRenewal <= 7 && !organization.cancelAtPeriodEnd));
  const payLabel =
    status === "trial" || status === "pending"
      ? "Subscribe now"
      : status === "active"
        ? "Renew now"
        : "Pay and reactivate";
  const cancelScheduledFor =
    organization.cancelAtPeriodEnd && periodEnd ? formatLong(periodEnd) : null;
  const cardLabel = method
    ? `${method.brand ?? "Card"} ending ${method.last4 ?? "····"}${method.expMonth && method.expYear ? `, expires ${method.expMonth}/${method.expYear}` : ""}`
    : null;
  const paymentNotice = paymentResult ? PAYMENT_NOTICES[paymentResult] : null;

  return (
    <div className="dash-stack">
      <div>
        <p className="dash-page-eyebrow">Billing</p>
        <h1 className="dash-page-title">Subscription & billing</h1>
        <p className="dash-page-subtitle">
          Manage your plan and see your payment history.
        </p>
      </div>

      {paymentNotice && (
        <p
          className={paymentNotice.kind === "error" ? "auth-error" : "auth-success"}
          role={paymentNotice.kind === "error" ? "alert" : "status"}
        >
          {paymentNotice.text}
        </p>
      )}

      <div className="plan-summary dash-card">
        <div className="plan-summary-head">
          <div>
            <p className="plan-summary-name">{plan.name}</p>
            <p className="plan-summary-note">
              {planNote(status, organization.trialEndsAt)}
            </p>
          </div>
          <p className="plan-summary-price">
            ₦{plan.priceMonthly.toLocaleString("en-US")}
            <span>/ month</span>
          </p>
        </div>
        <ul className="plan-summary-list">
          {planFeatures.map((feature) => (
            <li key={feature}>
              <Check size={14} aria-hidden="true" />
              {feature}
            </li>
          ))}
        </ul>
        {periodEnd && (status === "active" || status === "past_due") && (
          <p className="dash-empty" suppressHydrationWarning>
            {status === "past_due"
              ? `Payment overdue. Your access continues until ${formatLong(new Date(periodEnd.getTime() + 3 * 86400000))} while you pay.`
              : organization.cancelAtPeriodEnd
                ? `Paid until ${formatLong(periodEnd)}.`
                : `Paid until ${formatLong(periodEnd)}. Renews automatically${method ? " to your saved card" : ", pay before then to keep access"}.`}
          </p>
        )}
        <BillingControls
          canPay={canPay}
          isOwner={role === "Owner"}
          payLabel={payLabel}
          showPay={showPay}
          cardLabel={cardLabel}
          cancelScheduledFor={cancelScheduledFor}
        />
      </div>

      <div className="dash-card">
        <p className="dash-card-label">Plan usage</p>
        <div className="admin-bars">
          {usageRows.map((row) => {
            const limit = limitFor(plan, row.key);
            const percent =
              limit === null ? 0 : Math.min((row.used / limit) * 100, 100);

            return (
              <div className="admin-bar-row admin-bar-row--wide" key={row.key}>
                <span>{row.label}</span>
                <div className="admin-bar-track">
                  <div
                    className={`admin-bar-fill ${limit !== null && row.used >= limit ? "is-expired" : "is-active"}`}
                    style={{ width: `${limit === null ? 8 : percent}%` }}
                  />
                </div>
                <strong>
                  {row.used}
                  {limit === null ? "" : ` / ${limit}`}
                </strong>
              </div>
            );
          })}
        </div>
        <p className="dash-card-note" style={{ marginTop: "1rem" }}>
          Limits with no cap show as unlimited. To change your plan, email{" "}
          <a className="dash-banner-link" href="mailto:support@aimify.app">
            support@aimify.app
          </a>
          .
        </p>
      </div>

      <div className="dash-card">
        <p className="dash-card-label">Billing history</p>
        {history.length === 0 ? (
          <p className="dash-empty">
            {status === "trial" && organization.trialEndsAt
              ? `No payments yet. Your free trial runs until ${formatDate(organization.trialEndsAt)}.`
              : "No payments yet."}
          </p>
        ) : (
          <div className="dash-table-wrap">
            <table className="dash-table dash-table--money">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {history.map((payment) => (
                  <tr key={payment.id}>
                    <td>{formatDate(payment.paidAt ?? payment.createdAt)}</td>
                    <td>{payment.description ?? "Subscription"}</td>
                    <td>
                      {payment.currency} {payment.amount.toLocaleString("en-US")}
                    </td>
                    <td>
                      <span
                        className={`dash-badge ${paymentBadgeClass(payment.status)}`}
                      >
                        {describeSubscriptionStatus(payment.status)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {canCancelSubscription(status) &&
        !organization.cancelAtPeriodEnd &&
        context.membership?.role === "Owner" && (
        <CancelSubscriptionButton />
      )}
    </div>
  );
}
