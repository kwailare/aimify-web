"use client";

import { useOnboardingState } from "@/components/onboarding-store";

export default function DashboardOrganizationPage() {
  const state = useOnboardingState();

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
              defaultValue={state.companyName}
              type="text"
            />
          </div>
          <div className="auth-field">
            <label className="auth-label" htmlFor="dash-org-industry">
              Industry
            </label>
            <select className="auth-input" id="dash-org-industry" defaultValue="Wholesale">
              <option>Wholesale</option>
              <option>Distribution</option>
              <option>Retail</option>
              <option>Warehousing</option>
              <option>Other</option>
            </select>
          </div>
        </div>
        <div className="auth-field-row">
          <div className="auth-field">
            <label className="auth-label" htmlFor="dash-org-currency">
              Currency
            </label>
            <select className="auth-input" id="dash-org-currency" defaultValue="NGN — Naira">
              <option>NGN — Naira</option>
              <option>USD — Dollar</option>
              <option>GHS — Cedi</option>
              <option>KES — Shilling</option>
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
