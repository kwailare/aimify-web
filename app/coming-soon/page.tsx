import type { Metadata } from "next";
import { CountdownTimer } from "@/components/countdown-timer";

export const metadata: Metadata = {
  title: "Aimify — launching soon",
  description:
    "Aimify is almost here. Inventory management built for real warehouses.",
};

// Set in .env.local / Vercel as NEXT_PUBLIC_LAUNCH_AT (ISO date-time, e.g.
// "2026-10-15T09:00:00Z"). Public because the countdown runs in the browser.
const LAUNCH_AT = process.env.NEXT_PUBLIC_LAUNCH_AT;

export default function ComingSoonPage() {
  return (
    <main className="scene relative isolate flex min-h-screen items-center justify-center overflow-hidden px-4 py-12 sm:px-6">
      <div className="coming-soon-shell">
        <span className="nav-brand inline-flex items-baseline">
          <span className="brand-primary">Aimi</span>
          <span className="brand-accent">fy</span>
        </span>

        <section className="coming-soon-card">
          <p className="coming-soon-eyebrow">Launching soon</p>
          <h1 className="coming-soon-title">
            Inventory management, built for real warehouses.
          </h1>
          <p className="coming-soon-subtitle">
            We&apos;re putting the finishing touches on Aimify. Check back at
            launch, or reach out if you&apos;d like early access.
          </p>

          {LAUNCH_AT ? (
            <CountdownTimer targetIso={LAUNCH_AT} />
          ) : (
            <p className="coming-soon-subtitle">Launch date coming soon.</p>
          )}

          <a className="hero-secondary coming-soon-contact" href="mailto:hello@aimify.com">
            Get in touch
          </a>
        </section>
      </div>
    </main>
  );
}
