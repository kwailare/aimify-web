import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getOrgContext } from "@/lib/org";
import { DashboardShell } from "@/components/dashboard-shell";

// Same reasoning as app/admin/layout.tsx: this subtree is entirely
// session-backed and must always render at request time, never as a
// build-time static export.
export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
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

  if (context.membership.organization.subscriptionStatus === "suspended") {
    redirect("/account-suspended");
  }

  return (
    <DashboardShell
      user={context.user}
      organization={context.membership.organization}
      role={context.membership.role}
    >
      {children}
    </DashboardShell>
  );
}
