import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { auth } from "@/auth";
import { getAdminContext } from "@/lib/admin";
import { AdminShell } from "@/components/admin-shell";

// This whole subtree is session- and database-backed (admin/page.tsx and
// friends query the DB independently of this layout's own auth check), so
// it must never be attempted as a static build-time export -- that's what
// crashed the build against a fresh, unmigrated database (relation does
// not exist). force-dynamic applies across the whole route, not just this
// segment, so every /admin/* page inherits it from here.
export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/signin");
  }

  const context = await getAdminContext();

  if (!context) {
    redirect("/dashboard");
  }

  return <AdminShell admin={context.admin}>{children}</AdminShell>;
}
