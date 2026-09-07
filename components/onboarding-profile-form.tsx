"use client";

import { ArrowUpRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { completeProfileAction } from "@/lib/actions/onboarding";

export function OnboardingProfileForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsPending(true);

    const formData = new FormData(event.currentTarget);
    const result = await completeProfileAction(formData);

    setIsPending(false);

    if (result?.error) {
      setError(result.error);
      return;
    }

    router.push("/onboarding/organization");
  };

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <div className="auth-field">
        <label className="auth-label" htmlFor="profile-name">
          Full name
        </label>
        <input
          className="auth-input"
          id="profile-name"
          name="name"
          type="text"
          autoComplete="name"
          placeholder="Ada Obi"
          required
        />
      </div>
      <div className="auth-field">
        <label className="auth-label" htmlFor="profile-phone">
          Phone number
        </label>
        <input
          className="auth-input"
          id="profile-phone"
          name="phone"
          type="tel"
          autoComplete="tel"
          placeholder="+234 800 000 0000"
          required
        />
      </div>
      {error && <p className="auth-error">{error}</p>}
      <button className="auth-submit" type="submit" disabled={isPending}>
        {isPending ? "Saving…" : "Continue"}
        <ArrowUpRight size={16} aria-hidden="true" />
      </button>
    </form>
  );
}
