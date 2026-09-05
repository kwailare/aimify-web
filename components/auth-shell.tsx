import Link from "next/link";
import type { ReactNode } from "react";

export function AuthShell({
  eyebrow,
  title,
  subtitle,
  switchText,
  switchLabel,
  switchHref,
  children,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  switchText: string;
  switchLabel: string;
  switchHref: string;
  children: ReactNode;
}) {
  return (
    <main className="scene relative isolate flex min-h-screen items-center justify-center overflow-hidden px-4 py-12 sm:px-6">
      <div className="auth-shell">
        <Link className="nav-brand auth-brand inline-flex items-baseline" href="/">
          <span className="brand-primary">Aimi</span>
          <span className="brand-accent">fy</span>
        </Link>
        <section className="auth-card">
          <p className="auth-eyebrow">{eyebrow}</p>
          <h1 className="auth-title">{title}</h1>
          <p className="auth-subtitle">{subtitle}</p>
          {children}
        </section>
        <p className="auth-switch">
          {switchText}{" "}
          <Link className="auth-switch-link" href={switchHref}>
            {switchLabel}
          </Link>
        </p>
      </div>
    </main>
  );
}
