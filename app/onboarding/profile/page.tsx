import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { OnboardingShell } from "@/components/onboarding-shell";
import { OnboardingProfileForm } from "@/components/onboarding-profile-form";

export const metadata: Metadata = {
  title: "Set up your profile | Aimify",
};

export default async function OnboardingProfilePage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/signin");
  }

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
