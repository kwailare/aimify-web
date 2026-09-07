import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { redirect } from "next/navigation";
import { getOrgContext } from "@/lib/org";
import { OnboardingShell } from "@/components/onboarding-shell";
import { DownloadCard } from "@/components/download-card";

export const metadata: Metadata = {
  title: "Download Aimify | Aimify",
};

export default async function OnboardingDownloadPage() {
  const context = await getOrgContext();

  if (!context) {
    redirect("/signin");
  }

  if (!context.user.phone) {
    redirect("/onboarding/profile");
  }

  if (!context.membership) {
    redirect("/onboarding/organization");
  }

  if (context.membership.organization.subscriptionStatus === "pending") {
    redirect("/onboarding/subscription");
  }

  const firstName = context.user.name.split(" ")[0] || "there";

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
