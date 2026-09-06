import type { Metadata } from "next";
import { OnboardingShell } from "@/components/onboarding-shell";
import { OnboardingProfileForm } from "@/components/onboarding-profile-form";

export const metadata: Metadata = {
  title: "Set up your profile | Aimify",
};

export default function OnboardingProfilePage() {
  return (
    <OnboardingShell
      step={1}
      eyebrow="Step 1 of 4"
      title="Tell us about you"
      subtitle="This becomes the primary account on your organization."
    >
      <OnboardingProfileForm />
    </OnboardingShell>
  );
}
