"use client";

import { Check } from "lucide-react";
import { useDashboardContext } from "@/components/dashboard-context";
import { formatDate } from "@/lib/format-date";

const planFeatures = [
  "Real-time inventory across your warehouse",
  "Purchases, sales & automatic stock updates",
  "Customer credit & debt tracking",
  "WhatsApp alerts & repayment reminders",
  "Full audit trail on every transaction",
];

export default function DashboardBillingPage() {
  const { organization } = useDashboardContext();

  const invoices = [
    {
      date: `Trial started ${formatDate(organization.createdAt)}`,
      amount: "₦0",
      status: "Active",
    },
    {
      date: organization.trialEndsAt
        ? `Trial ends ${formatDate(organization.trialEndsAt)}`
        : "Trial end date not set",
      amount: "₦25,000",
      status: "Upcoming",
    },
  ];

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
            <p className="plan-summary-name">Full Access</p>
            <p className="plan-summary-note">
              {organization.subscriptionStatus === "trial"
                ? "14-day free trial · billed monthly after"
                : "Billed monthly"}
            </p>
          </div>
          <p className="plan-summary-price">
            ₦25,000<span>/ month</span>
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
      </div>

      <div className="dash-card">
        <p className="dash-card-label">Billing history</p>
        <div className="dash-table-wrap">
          <table className="dash-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => (
                <tr key={invoice.date}>
                  <td>{invoice.date}</td>
                  <td>{invoice.amount}</td>
                  <td>
                    <span
                      className={`dash-badge ${
                        invoice.status === "Active" ? "is-active" : "is-upcoming"
                      }`}
                    >
                      {invoice.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <button className="dash-danger-link" type="button">
        Cancel subscription
      </button>
    </div>
  );
}
