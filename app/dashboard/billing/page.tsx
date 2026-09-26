import { desc, eq } from "drizzle-orm";
import { Check } from "lucide-react";
import { redirect } from "next/navigation";
import { CancelSubscriptionButton } from "@/components/cancel-subscription-button";
import { db } from "@/db";
import { payments } from "@/db/schema";
import { getOrgPlan, getUsage, limitFor, type LimitKey } from "@/lib/plans";
import { formatDate } from "@/lib/format-date";
import { getOrgContext } from "@/lib/org";
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

export default async function DashboardBillingPage() {
  const context = await getOrgContext();

  if (!context?.membership) {
    redirect("/signin");
  }

  const { organization } = context.membership;

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
  const needsPlan = ["expired", "cancelled", "past_due"].includes(status);

  return (
    <div className="dash-stack">
      <div>
        <p className="dash-page-eyebrow">Billing</p>
        <h1 className="dash-page-title">Subscription & billing</h1>
        <p className="dash-page-subtitle">
          Manage your plan and see your payment history.
        </p>
      </div>

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
        {(needsPlan || status === "trial") && (
          <p className="dash-empty">
            Online payments aren&apos;t live yet. To{" "}
            {needsPlan ? "reactivate" : "activate"} your plan, email{" "}
            <a className="dash-banner-link" href="mailto:support@aimify.app">
              support@aimify.app
            </a>{" "}
            and we&apos;ll set it up with you.
          </p>
        )}
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

      {canCancelSubscription(status) && context.membership?.role === "Owner" && (
        <CancelSubscriptionButton />
      )}
    </div>
  );
}
