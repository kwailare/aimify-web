"use client";

import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { PasswordInput } from "@/components/password-input";
import {
  acceptInviteAsExistingUserAction,
  acceptInviteAsNewUserAction,
} from "@/lib/actions/invite-accept";

export function AcceptInviteForm({
  token,
  mode,
  email,
  organizationName,
}: {
  token: string;
  mode: "new" | "existing-signed-in" | "existing-signed-out";
  email: string;
  organizationName: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const handleNewUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsPending(true);

    const result = await acceptInviteAsNewUserAction(
      token,
      new FormData(event.currentTarget),
    );

    setIsPending(false);

    if (result?.error) {
      setError(result.error);
      return;
    }

    router.push(result?.signedIn ? "/dashboard" : "/signin");
  };

  const handleExisting = async () => {
    setError(null);
    setIsPending(true);

    const result = await acceptInviteAsExistingUserAction(token);

    setIsPending(false);

    if (result?.error) {
      setError(result.error);
      return;
    }

    router.push("/dashboard");
  };

  if (mode === "existing-signed-out") {
    return (
      <div className="auth-form">
        <p className="auth-subtitle">
          {email} already has an Aimify account. Sign in with it, then open this
          invitation link again to join {organizationName}.
        </p>
        <Link className="hero-primary" href="/signin">
          Sign in
          <ArrowUpRight size={16} aria-hidden="true" />
        </Link>
      </div>
    );
  }

  if (mode === "existing-signed-in") {
    return (
      <div className="auth-form">
        {error && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}
        <button
          className="auth-submit"
          type="button"
          onClick={handleExisting}
          disabled={isPending}
        >
          {isPending ? "Joining…" : `Join ${organizationName}`}
          <ArrowUpRight size={16} aria-hidden="true" />
        </button>
      </div>
    );
  }

  return (
    <form className="auth-form" onSubmit={handleNewUser}>
      <div className="auth-field">
        <label className="auth-label" htmlFor="invite-email">
          Email
        </label>
        <input
          className="auth-input"
          id="invite-email"
          type="email"
          value={email}
          readOnly
        />
      </div>
      <div className="auth-field">
        <label className="auth-label" htmlFor="invite-name">
          Full name
        </label>
        <input
          className="auth-input"
          id="invite-name"
          name="name"
          type="text"
          autoComplete="name"
          placeholder="Ada Obi"
          required
        />
      </div>
      <div className="auth-field">
        <label className="auth-label" htmlFor="invite-phone">
          Phone number
        </label>
        <input
          className="auth-input"
          id="invite-phone"
          name="phone"
          type="tel"
          autoComplete="tel"
          placeholder="+234 801 234 5678"
          required
        />
      </div>
      <PasswordInput
        label="Password"
        name="password"
        autoComplete="new-password"
        placeholder="At least 8 characters"
      />
      <label className="auth-checkbox-row">
        <input type="checkbox" name="terms" required />
        I agree to the <Link href="/terms">Terms of Service</Link> and{" "}
        <Link href="/privacy">Privacy Policy</Link>
      </label>
      {error && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}
      <button className="auth-submit" type="submit" disabled={isPending}>
        {isPending ? "Joining…" : `Join ${organizationName}`}
        <ArrowUpRight size={16} aria-hidden="true" />
      </button>
    </form>
  );
}
