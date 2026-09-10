import type { Metadata } from "next";
import Link from "next/link";
import { Ban } from "lucide-react";
import { SuspendedActions } from "@/components/suspended-actions";

export const metadata: Metadata = {
  title: "Account suspended | Aimify",
  description: "Your organization's access has been suspended.",
};

export default function AccountSuspendedPage() {
  return (
    <main className="scene relative isolate flex min-h-screen items-center justify-center overflow-hidden px-4 py-12 sm:px-6">
      <div className="not-found-shell">
        <Link className="nav-brand inline-flex items-baseline" href="/">
          <span className="brand-primary">Aimi</span>
          <span className="brand-accent">fy</span>
        </Link>
        <section className="not-found-card">
          <span className="not-found-icon is-warning" aria-hidden="true">
            <Ban size={26} strokeWidth={1.8} />
          </span>
          <h1 className="not-found-title">
            Your organization&apos;s access is suspended.
          </h1>
          <p className="not-found-subtitle">
            This account has been temporarily suspended. If you believe this
            is a mistake, or you&apos;d like to resolve it, reach out and
            we&apos;ll help sort it out.
          </p>
          <SuspendedActions />
        </section>
      </div>
    </main>
  );
}
