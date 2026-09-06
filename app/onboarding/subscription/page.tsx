import type { Metadata } from "next";
import { OnboardingShell } from "@/components/onboarding-shell";
import { OnboardingSubscriptionForm } from "@/components/onboarding-subscription-form";

export const metadata: Metadata = {
  title: "Choose your plan | Aimify",
};

export default function OnboardingSubscriptionPage() {
  return (
    <OnboardingShell
      step={3}
      eyebrow="Step 3 of 4"
      title="Choose your plan"
      subtitle="One plan with the complete toolkit — no enterprise pricing games."
    >
      <OnboardingSubscriptionForm />
    </OnboardingShell>
  );
}
