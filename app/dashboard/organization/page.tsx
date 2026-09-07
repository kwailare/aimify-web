"use client";

import { useDashboardContext } from "@/components/dashboard-context";

const industries = [
  "Wholesale",
  "Distribution",
  "Retail",
  "Warehousing",
  "Other",
];

const currencies = [
  { code: "NGN", label: "Naira" },
  { code: "USD", label: "Dollar" },
  { code: "GHS", label: "Cedi" },
  { code: "KES", label: "Shilling" },
];

export default function DashboardOrganizationPage() {
  const { organization } = useDashboardContext();

  return (
    <div className="dash-stack">
      <div>
        <p className="dash-page-eyebrow">Organization</p>
        <h1 className="dash-page-title">Organization profile</h1>
        <p className="dash-page-subtitle">
          Every transaction across your team is tied to this organization
          for full tenant isolation.
        </p>
      </div>

      <form className="dash-card dash-form">
        <div className="auth-field-row">
          <div className="auth-field">
            <label className="auth-label" htmlFor="dash-org-name">
              Company name
            </label>
            <input
              className="auth-input"
              id="dash-org-name"
              defaultValue={organization.name}
              type="text"
            />
          </div>
          <div className="auth-field">
            <label className="auth-label" htmlFor="dash-org-industry">
              Industry
            </label>
            <select
              className="auth-input"
              id="dash-org-industry"
              defaultValue={organization.industry ?? industries[0]}
            >
              {industries.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="auth-field-row">
          <div className="auth-field">
            <label className="auth-label" htmlFor="dash-org-currency">
              Currency
            </label>
            <select
              className="auth-input"
              id="dash-org-currency"
              defaultValue={organization.currency}
            >
              {currencies.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.code} — {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="auth-field">
            <label className="auth-label" htmlFor="dash-org-warehouse">
              Primary warehouse
            </label>
            <input
              className="auth-input"
              id="dash-org-warehouse"
              type="text"
              defaultValue={organization.warehouseName ?? ""}
              placeholder="Main warehouse — Lagos"
            />
          </div>
        </div>
        <button className="auth-submit dash-submit" type="button">
          Save changes
        </button>
      </form>
    </div>
  );
}
