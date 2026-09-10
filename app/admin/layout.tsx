import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { auth } from "@/auth";
import { getAdminContext } from "@/lib/admin";
import { AdminShell } from "@/components/admin-shell";

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
