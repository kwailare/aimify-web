"use client";

import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { PasswordInput } from "@/components/password-input";
import { signUpAction } from "@/lib/actions/auth";

export function SignUpForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsPending(true);

    const formData = new FormData(event.currentTarget);
    const result = await signUpAction(formData);

    setIsPending(false);

    if (result?.error) {
      setError(result.error);
      return;
    }

    router.push("/onboarding/profile");
  };

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <div className="auth-field">
        <label className="auth-label" htmlFor="signup-name">
          Full name
        </label>
        <input
          className="auth-input"
          id="signup-name"
          name="name"
          type="text"
          autoComplete="name"
          placeholder="Ada Obi"
          required
        />
      </div>
      <div className="auth-field">
        <label className="auth-label" htmlFor="signup-email">
          Work email
        </label>
        <input
          className="auth-input"
          id="signup-email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@company.com"
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
        I agree to the <Link href="/#terms">Terms of Service</Link> and{" "}
        <Link href="/#privacy">Privacy Policy</Link>
      </label>
      {error && <p className="auth-error">{error}</p>}
      <button className="auth-submit" type="submit" disabled={isPending}>
        {isPending ? "Creating account…" : "Start free trial"}
        <ArrowUpRight size={16} aria-hidden="true" />
      </button>
    </form>
  );
}
