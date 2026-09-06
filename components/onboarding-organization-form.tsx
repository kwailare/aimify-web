"use client";

import { ArrowUpRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { completeOrganization } from "@/components/onboarding-store";

const industries = [
  "Wholesale",
  "Distribution",
  "Retail",
  "Warehousing",
  "Other",
];

const currencies = ["NGN — Naira", "USD — Dollar", "GHS — Cedi", "KES — Shilling"];

export function OnboardingOrganizationForm() {
  const router = useRouter();
  const [companyName, setCompanyName] = useState("");

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    completeOrganization(companyName.trim() || "Your organization");
    router.push("/onboarding/subscription");
  };

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <div className="auth-field">
        <label className="auth-label" htmlFor="org-name">
          Company name
        </label>
        <input
          className="auth-input"
          id="org-name"
          name="companyName"
          type="text"
          autoComplete="organization"
          placeholder="Obi Distribution Ltd"
          value={companyName}
          onChange={(event) => setCompanyName(event.target.value)}
          required
        />
      </div>
      <div className="auth-field-row">
        <div className="auth-field">
          <label className="auth-label" htmlFor="org-industry">
            Industry
          </label>
          <select className="auth-input" id="org-industry" name="industry">
            {industries.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
        <div className="auth-field">
          <label className="auth-label" htmlFor="org-currency">
            Currency
          </label>
          <select className="auth-input" id="org-currency" name="currency">
            {currencies.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="auth-field">
        <label className="auth-label" htmlFor="org-warehouse">
          Primary warehouse name
        </label>
        <input
          className="auth-input"
          id="org-warehouse"
          name="warehouse"
          type="text"
          placeholder="Main warehouse — Lagos"
          required
        />
      </div>
      <button className="auth-submit" type="submit">
        Continue
        <ArrowUpRight size={16} aria-hidden="true" />
      </button>
    </form>
  );
}
