"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { OnboardingShell } from "@/components/onboarding-shell";
import { DownloadCard } from "@/components/download-card";
import {
  nextIncompleteStep,
  useOnboardingState,
} from "@/components/onboarding-store";

export function OnboardingDownloadGate() {
  const router = useRouter();
  const state = useOnboardingState();
  const redirectTo = nextIncompleteStep(state);

  useEffect(() => {
    if (redirectTo) {
      router.replace(redirectTo);
    }
  }, [redirectTo, router]);

  if (redirectTo) {
    return null;
  }

  const firstName = state.fullName.split(" ")[0] || "there";

  return (
    <OnboardingShell
      step={4}
      eyebrow="Step 4 of 4"
      title={`You're all set, ${firstName}`}
      subtitle="Your organization and subscription are ready. Download the desktop app to start managing inventory."
    >
      <DownloadCard />
      <Link className="onboarding-skip" href="/dashboard">
        Go to dashboard instead
        <ArrowUpRight size={14} aria-hidden="true" />
      </Link>
    </OnboardingShell>
  );
}
