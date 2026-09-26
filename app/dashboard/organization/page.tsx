"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useDashboardContext } from "@/components/dashboard-context";
import { LogoUploader } from "@/components/logo-uploader";
import { canManageTeam } from "@/lib/roles";
import { updateOrganizationAction } from "@/lib/actions/organization";
import {
  CURRENCIES,
  DATE_FORMATS,
  INDUSTRIES,
  TIMEZONES,
} from "@/lib/org-options";

export default function DashboardOrganizationPage() {
  const router = useRouter();
  const { organization, role } = useDashboardContext();
  const canEdit = canManageTeam(role);
  const [notice, setNotice] = useState<{
    kind: "error" | "success";
    text: string;
  } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setNotice(null);
    setIsSaving(true);

    const result = await updateOrganizationAction(
      new FormData(event.currentTarget),
    );

    setIsSaving(false);

    if (result?.error) {
      setNotice({ kind: "error", text: result.error });
      return;
    }

    setNotice({ kind: "success", text: "Organization profile saved." });
    router.refresh();
  };

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

      {!canEdit && (
        <p className="dash-card-note">
          You&apos;re signed in as {role}. Only an Owner or Administrator can
          change the organization profile.
        </p>
      )}

      {canEdit && (
        <LogoUploader
          logoUrl={organization.logoUrl}
          organizationName={organization.name}
        />
      )}

      <form className="dash-card dash-form" onSubmit={handleSubmit}>
        <fieldset className="dash-fieldset" disabled={!canEdit}>
        <p className="dash-card-label">Company</p>
        <div className="auth-field-row">
          <div className="auth-field">
            <label className="auth-label" htmlFor="dash-org-name">
              Company name
            </label>
            <input
              className="auth-input"
              id="dash-org-name"
              name="companyName"
              defaultValue={organization.name}
              type="text"
              required
            />
          </div>
          <div className="auth-field">
            <label className="auth-label" htmlFor="dash-org-industry">
              Industry
            </label>
            <select
              className="auth-input"
              id="dash-org-industry"
              name="industry"
              defaultValue={organization.industry ?? INDUSTRIES[0]}
            >
              {INDUSTRIES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="auth-field-row">
          <div className="auth-field">
            <label className="auth-label" htmlFor="dash-org-registration">
              Registration number
            </label>
            <input
              className="auth-input"
              id="dash-org-registration"
              name="registrationNumber"
              type="text"
              defaultValue={organization.registrationNumber ?? ""}
              placeholder="RC 1234567"
            />
          </div>
          <div className="auth-field">
            <label className="auth-label" htmlFor="dash-org-warehouse">
              Primary warehouse
            </label>
            <input
              className="auth-input"
              id="dash-org-warehouse"
              name="warehouseName"
              type="text"
              defaultValue={organization.warehouseName ?? ""}
              placeholder="Main warehouse — Lagos"
            />
          </div>
        </div>

        <p className="dash-card-label">Contact</p>
        <div className="auth-field">
          <label className="auth-label" htmlFor="dash-org-address">
            Address
          </label>
          <input
            className="auth-input"
            id="dash-org-address"
            name="address"
            type="text"
            autoComplete="street-address"
            defaultValue={organization.address ?? ""}
          />
        </div>
        <div className="auth-field-row">
          <div className="auth-field">
            <label className="auth-label" htmlFor="dash-org-phone">
              Company phone
            </label>
            <input
              className="auth-input"
              id="dash-org-phone"
              name="phone"
              type="tel"
              defaultValue={organization.phone ?? ""}
            />
          </div>
          <div className="auth-field">
            <label className="auth-label" htmlFor="dash-org-email">
              Company email
            </label>
            <input
              className="auth-input"
              id="dash-org-email"
              name="email"
              type="email"
              defaultValue={organization.email ?? ""}
            />
          </div>
        </div>

        <p className="dash-card-label">Regional settings</p>
        <div className="auth-field-row">
          <div className="auth-field">
            <label className="auth-label" htmlFor="dash-org-currency">
              Currency
            </label>
            <select
              className="auth-input"
              id="dash-org-currency"
              name="currency"
              defaultValue={organization.currency}
            >
              {CURRENCIES.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.code} — {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="auth-field">
            <label className="auth-label" htmlFor="dash-org-timezone">
              Time zone
            </label>
            <select
              className="auth-input"
              id="dash-org-timezone"
              name="timezone"
              defaultValue={organization.timezone}
            >
              {TIMEZONES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="auth-field-row">
          <div className="auth-field">
            <label className="auth-label" htmlFor="dash-org-date-format">
              Date format
            </label>
            <select
              className="auth-input"
              id="dash-org-date-format"
              name="dateFormat"
              defaultValue={organization.dateFormat}
            >
              {DATE_FORMATS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
          <div className="auth-field">
            <label className="auth-label" htmlFor="dash-org-tax-name">
              Tax name
            </label>
            <input
              className="auth-input"
              id="dash-org-tax-name"
              name="taxName"
              type="text"
              defaultValue={organization.taxName ?? ""}
              placeholder="VAT"
            />
          </div>
        </div>
        <div className="auth-field">
          <label className="auth-label" htmlFor="dash-org-tax-rate">
            Tax rate (%)
          </label>
          <input
            className="auth-input"
            id="dash-org-tax-rate"
            name="taxRate"
            type="number"
            min="0"
            max="100"
            step="0.01"
            defaultValue={organization.taxRate}
          />
        </div>

        {notice && (
          <p
            className={notice.kind === "error" ? "auth-error" : "auth-success"}
            role={notice.kind === "error" ? "alert" : "status"}
          >
            {notice.text}
          </p>
        )}
        <button
          className="auth-submit dash-submit"
          type="submit"
          disabled={isSaving}
        >
          {isSaving ? "Saving…" : "Save changes"}
        </button>
        </fieldset>
      </form>
    </div>
  );
}
