import type { Metadata } from "next";
import { OnboardingShell } from "@/components/onboarding-shell";
import { OnboardingOrganizationForm } from "@/components/onboarding-organization-form";

export const metadata: Metadata = {
  title: "Set up your organization | Aimify",
};

export default function OnboardingOrganizationPage() {
  return (
    <OnboardingShell
      step={2}
      eyebrow="Step 2 of 4"
      title="Set up your organization"
      subtitle="Every transaction in Aimify is tied to your organization for full tenant isolation."
    >
      <OnboardingOrganizationForm />
    </OnboardingShell>
  );
}
