import Link from "next/link";
import { Check } from "lucide-react";
import type { ReactNode } from "react";

const steps = [
  { number: 1, label: "Profile" },
  { number: 2, label: "Organization" },
  { number: 3, label: "Subscription" },
  { number: 4, label: "Download" },
];

export function OnboardingShell({
  step,
  eyebrow,
  title,
  subtitle,
  children,
}: {
  step: 1 | 2 | 3 | 4;
  eyebrow: string;
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <main className="scene relative isolate flex min-h-screen items-center justify-center overflow-hidden px-4 py-12 sm:px-6">
      <div className="onboarding-shell">
        <Link
          className="nav-brand inline-flex items-baseline"
          href="/"
        >
          <span className="brand-primary">Aimi</span>
          <span className="brand-accent">fy</span>
        </Link>
        <ol className="onboarding-steps" aria-label="Setup progress">
          {steps.map((item) => {
            const status =
              item.number < step
                ? "done"
                : item.number === step
                  ? "current"
                  : "upcoming";

            return (
              <li
                key={item.number}
                className={`onboarding-step is-${status}`}
              >
                <span className="onboarding-step-dot" aria-hidden="true">
                  {status === "done" ? <Check size={12} /> : item.number}
                </span>
                <span className="onboarding-step-label">{item.label}</span>
              </li>
            );
          })}
        </ol>
        <section className="auth-card onboarding-card">
          <p className="auth-eyebrow">{eyebrow}</p>
          <h1 className="auth-title">{title}</h1>
          <p className="auth-subtitle">{subtitle}</p>
          {children}
        </section>
      </div>
    </main>
  );
}
