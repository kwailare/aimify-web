import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { OnboardingShell } from "@/components/onboarding-shell";
import { OnboardingOrganizationForm } from "@/components/onboarding-organization-form";

export const metadata: Metadata = {
  title: "Set up your organization | Aimify",
};

export default async function OnboardingOrganizationPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/signin");
  }

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
