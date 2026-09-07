import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { OnboardingShell } from "@/components/onboarding-shell";
import { OnboardingSubscriptionForm } from "@/components/onboarding-subscription-form";

export const metadata: Metadata = {
  title: "Choose your plan | Aimify",
};

export default async function OnboardingSubscriptionPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/signin");
  }

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
