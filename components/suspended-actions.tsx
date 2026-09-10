"use client";

import { signOut } from "next-auth/react";

export function SuspendedActions() {
  return (
    <div className="not-found-actions">
      <button
        className="hero-primary"
        type="button"
        onClick={() => signOut({ redirectTo: "/signin" })}
      >
        Sign out
      </button>
      <a className="hero-secondary" href="mailto:hello@aimify.com">
        Contact support
      </a>
    </div>
  );
}
