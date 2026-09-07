"use client";

import { ArrowUpRight, Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { completeSubscriptionAction } from "@/lib/actions/onboarding";

const planFeatures = [
  "Real-time inventory across your warehouse",
  "Purchases, sales & automatic stock updates",
  "Customer credit & debt tracking",
  "WhatsApp alerts & repayment reminders",
  "Full audit trail on every transaction",
];

const paymentMethods = ["Card", "Bank transfer", "USSD"];

export function OnboardingSubscriptionForm() {
  const router = useRouter();
  const [method, setMethod] = useState(paymentMethods[0]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsPending(true);

    const result = await completeSubscriptionAction();

    setIsPending(false);

    if (result?.error) {
      setError(result.error);
      return;
    }

    router.push("/onboarding/download");
  };

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <div className="plan-summary">
        <div className="plan-summary-head">
          <div>
            <p className="plan-summary-name">Full Access</p>
            <p className="plan-summary-note">14-day free trial, then billed monthly</p>
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
      <div className="auth-field">
        <span className="auth-label">Payment method</span>
        <div className="payment-method-row">
          {paymentMethods.map((option) => (
            <label
              key={option}
              className={`payment-method-option ${method === option ? "is-selected" : ""}`}
            >
              <input
                type="radio"
                name="paymentMethod"
                value={option}
                checked={method === option}
                onChange={() => setMethod(option)}
              />
              {option}
            </label>
          ))}
        </div>
      </div>
      <p className="auth-subtitle">
        You won&apos;t be charged until your 14-day trial ends. Cancel
        anytime from Billing.
      </p>
      {error && <p className="auth-error">{error}</p>}
      <button className="auth-submit" type="submit" disabled={isPending}>
        {isPending ? "Starting trial…" : "Confirm & start trial"}
        <ArrowUpRight size={16} aria-hidden="true" />
      </button>
    </form>
  );
}
