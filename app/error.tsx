"use client";

import { useEffect } from "react";
import Link from "next/link";
import { TriangleAlert } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Client-side only, so this at least lands in the browser console with
    // whatever digest Next.js attached, until real error reporting exists.
    console.error(error);
  }, [error]);

  return (
    <main className="scene relative isolate flex min-h-screen items-center justify-center overflow-hidden px-4 py-12 sm:px-6">
      <div className="not-found-shell">
        <Link className="nav-brand inline-flex items-baseline" href="/">
          <span className="brand-primary">Aimi</span>
          <span className="brand-accent">fy</span>
        </Link>
        <section className="not-found-card">
          <span className="not-found-icon is-warning" aria-hidden="true">
            <TriangleAlert size={26} strokeWidth={1.8} />
          </span>
          <h1 className="not-found-title">Something went wrong.</h1>
          <p className="not-found-subtitle">
            That&apos;s on us, not you. Try again, or reach out if it keeps
            happening.
          </p>
          <div className="not-found-actions">
            <button className="hero-primary" type="button" onClick={reset}>
              Try again
            </button>
            <a className="hero-secondary" href="mailto:aimifygroup@gmail.com">
              Contact support
            </a>
          </div>
        </section>
      </div>
    </main>
  );
}
