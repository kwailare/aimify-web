import type { Metadata } from "next";
import { OnboardingDownloadGate } from "@/components/onboarding-download-gate";

export const metadata: Metadata = {
  title: "Download Aimify | Aimify",
};

export default function OnboardingDownloadPage() {
  return <OnboardingDownloadGate />;
}
