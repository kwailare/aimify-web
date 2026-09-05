import { Check, ArrowUpRight } from "lucide-react";
import Link from "next/link";

const plan = {
  name: "Full Access",
  description: "One secure, auditable workspace for your entire business.",
  price: "₦25,000",
  cadence: "/ month",
  features: [
    "Real-time inventory across your warehouse",
    "Purchases, sales & automatic stock updates",
    "Customer credit & debt tracking",
    "Supplier & expense management",
    "WhatsApp alerts & repayment reminders",
    "Full audit trail on every transaction",
    "Dashboards, analytics & reports",
  ],
};

export function Pricing() {
  return (
    <section id="pricing" className="pricing-panel w-full p-7 sm:p-12 lg:p-16">
      <div className="mb-10 max-w-2xl">
        <p className="body-kicker text-xs font-bold uppercase tracking-[0.28em]">
          Priced for growing businesses, not enterprise budgets
        </p>
        <h2 className="features-title mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
          Everything you need, without enterprise pricing.
        </h2>
        <p className="body-copy mt-4 max-w-xl text-base leading-7">
          One plan with the complete toolkit — inventory, sales, credit and
          suppliers — built for wholesalers, distributors and retailers.
        </p>
      </div>
      <div className="pricing-grid">
        <article className="pricing-card is-featured">
          <span className="pricing-badge">Free 14-day trial</span>
          <h3>{plan.name}</h3>
          <p className="pricing-description">{plan.description}</p>
          <div className="pricing-price">
            <strong>{plan.price}</strong>
            <span>{plan.cadence}</span>
          </div>
          <ul>
            {plan.features.map((feature) => (
              <li key={feature}>
                <Check size={15} aria-hidden="true" />
                {feature}
              </li>
            ))}
          </ul>
          <Link className="pricing-action" href="/signup">
            Start free trial
            <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
        </article>
      </div>
    </section>
  );
}
