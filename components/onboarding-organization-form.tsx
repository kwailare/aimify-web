"use client";

import { ArrowUpRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { completeOrganizationAction } from "@/lib/actions/onboarding";

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

const roles = [
  "Owner",
  "Administrator",
  "Warehouse Manager",
  "Sales Staff",
  "Inventory Staff",
  "Accountant / Finance",
];

export function OnboardingOrganizationForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsPending(true);

    const formData = new FormData(event.currentTarget);
    const result = await completeOrganizationAction(formData);

    setIsPending(false);

    if (result?.error) {
      setError(result.error);
      return;
    }

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
              <option key={option.code} value={option.code}>
                {option.code} — {option.label}
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
      <div className="auth-field">
        <label className="auth-label" htmlFor="org-role">
          Your role at this organization
        </label>
        <select className="auth-input" id="org-role" name="role">
          {roles.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>
      {error && <p className="auth-error">{error}</p>}
      <button className="auth-submit" type="submit" disabled={isPending}>
        {isPending ? "Saving…" : "Continue"}
        <ArrowUpRight size={16} aria-hidden="true" />
      </button>
    </form>
  );
}
