"use client";

import { ArrowUpRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { completeProfile } from "@/components/onboarding-store";

const roles = [
  "Owner",
  "Administrator",
  "Warehouse Manager",
  "Sales Staff",
  "Inventory Staff",
  "Accountant / Finance",
];

export function OnboardingProfileForm() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState(roles[0]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    completeProfile(fullName.trim() || "There", role);
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
          name="fullName"
          type="text"
          autoComplete="name"
          placeholder="Ada Obi"
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
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
      <div className="auth-field">
        <label className="auth-label" htmlFor="profile-role">
          Your role
        </label>
        <select
          className="auth-input"
          id="profile-role"
          name="role"
          value={role}
          onChange={(event) => setRole(event.target.value)}
        >
          {roles.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>
      <button className="auth-submit" type="submit">
        Continue
        <ArrowUpRight size={16} aria-hidden="true" />
      </button>
    </form>
  );
}
