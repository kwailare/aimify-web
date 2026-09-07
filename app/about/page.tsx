import type { Metadata } from "next";
import { ArrowUpRight, Boxes, ShieldCheck, Users } from "lucide-react";
import Link from "next/link";
import { MarketingShell } from "@/components/marketing-shell";

export const metadata: Metadata = {
  title: "About Aimify | Aimify",
  description:
    "Why we built Aimify — a multi-tenant inventory platform for wholesalers, distributors and retailers who've outgrown spreadsheets.",
};

const values = [
  {
    icon: ShieldCheck,
    title: "Nothing gets overwritten",
    description:
      "Every stock change is a recorded transaction tied to a user, a reason and a timestamp — never a silent edit. That's not a feature we bolted on, it's the principle the whole system is built around.",
  },
  {
    icon: Users,
    title: "Built for how you actually trade",
    description:
      "WhatsApp-native alerts instead of email nobody checks. Credit and debt tracking because cash sales aren't the whole story. We designed around real operations, not a generic template.",
  },
  {
    icon: Boxes,
    title: "One plan, everything included",
    description:
      "No feature paywalls, no per-seat surprises. Inventory, purchases, sales, credit and suppliers in one subscription — priced for growing businesses, not enterprise budgets.",
  },
];

const stats = [
  { value: "1", label: "Secure tenant per business" },
  { value: "14", label: "Day free trial, no card required" },
  { value: "Full", label: "Audit trail on every transaction" },
];

export default function AboutPage() {
  return (
    <MarketingShell>
      <section className="body-panel content-panel w-full space-y-10 p-7 sm:p-12 lg:p-16">
        <div>
          <p className="body-kicker text-xs font-bold uppercase tracking-[0.28em]">
            About Aimify
          </p>
          <h1 className="body-title mt-3 max-w-2xl text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl">
            Built for businesses spreadsheets can&apos;t keep up with.
          </h1>
          <p className="body-copy content-lede mt-6 text-base leading-7 sm:text-lg">
            Aimify started from a simple observation: most inventory software
            is either a notebook that doesn&apos;t scale, or enterprise
            software priced and built for a business ten times your size.
            Wholesalers, distributors and retailers in between are left
            underserved — too big for spreadsheets, priced out of everything
            else.
          </p>
          <p className="body-copy content-lede mt-4 text-base leading-7 sm:text-lg">
            So we built a multi-tenant platform where every subscribing
            business gets its own secure, isolated workspace — inventory,
            purchases, sales, customers, suppliers and expenses, all tied
            together with a full audit trail. One codebase, one platform,
            built to be affordable precisely because it&apos;s shared
            infrastructure underneath.
          </p>
        </div>

        <div className="features-grid">
          {values.map((value) => {
            const Icon = value.icon;

            return (
              <article className="feature-card" key={value.title}>
                <span className="feature-icon" aria-hidden="true">
                  <Icon size={20} strokeWidth={1.8} />
                </span>
                <h3>{value.title}</h3>
                <p>{value.description}</p>
              </article>
            );
          })}
        </div>

        <div className="hero-metrics" aria-label="Aimify at a glance">
          {stats.map((stat) => (
            <div className="hero-metric" key={stat.label}>
              <strong>{stat.value}</strong>
              <span>{stat.label}</span>
            </div>
          ))}
        </div>

        <div className="hero-actions flex flex-col gap-3 sm:flex-row">
          <Link className="hero-primary" href="/signup">
            Get started
            <ArrowUpRight size={17} aria-hidden="true" />
          </Link>
          <Link className="hero-secondary" href="/contact">
            Talk to us
          </Link>
        </div>
      </section>
    </MarketingShell>
  );
}
