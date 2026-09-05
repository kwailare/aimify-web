import type { Metadata } from "next";
import Link from "next/link";
import { PackageX } from "lucide-react";

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
            <PackageX size={26} strokeWidth={1.8} />
          </span>
          <p className="not-found-code">404</p>
          <h1 className="not-found-title">This page is out of stock.</h1>
          <p className="not-found-subtitle">
            We couldn&apos;t find the page you were looking for. It may have
            been moved, renamed, or never existed in this warehouse.
          </p>
          <div className="not-found-actions">
            <Link className="hero-primary" href="/">
              Back to home
            </Link>
            <a className="hero-secondary" href="mailto:hello@aimify.com">
              Contact support
            </a>
          </div>
        </section>
      </div>
    </main>
  );
}
