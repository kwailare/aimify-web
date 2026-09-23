import type { Metadata } from "next";
import Link from "next/link";
import { SearchX } from "lucide-react";

export const metadata: Metadata = {
  title: "Page not found | Aimify",
  description: "The page you're looking for doesn't exist.",
};

export default function NotFound() {
  return (
    <main className="scene relative isolate flex min-h-screen items-center justify-center overflow-hidden px-4 py-12 sm:px-6">
      <div className="not-found-shell">
        <Link
          className="nav-brand inline-flex items-baseline"
          href="/"
        >
          <span className="brand-primary">Aimi</span>
          <span className="brand-accent">fy</span>
        </Link>
        <section className="not-found-card">
          <span className="not-found-icon" aria-hidden="true">
            <SearchX size={26} strokeWidth={1.8} />
          </span>
          <p className="not-found-code">404</p>
          <h1 className="not-found-title">Page not found</h1>
          <p className="not-found-subtitle">
            The page you&apos;re looking for doesn&apos;t exist, may have been
            moved, or the link may be incorrect.
          </p>
          <div className="not-found-actions">
            <Link className="hero-primary" href="/">
              Back to home
            </Link>
            <a className="hero-secondary" href="mailto:support@aimify.app">
              Contact support
            </a>
          </div>
        </section>
      </div>
    </main>
  );
}
