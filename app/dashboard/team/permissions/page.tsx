import Link from "next/link";
import { redirect } from "next/navigation";
import { PermissionsEditor } from "@/components/permissions-editor";
import { getOrgContext } from "@/lib/org";
import { getPermissionMatrix } from "@/lib/role-permissions";
import { canManageTeam } from "@/lib/roles";

export default async function DashboardPermissionsPage() {
  const context = await getOrgContext();

  if (!context?.membership) {
    redirect("/signin");
  }

  const { organization, role } = context.membership;

  if (!canManageTeam(role)) {
    redirect("/dashboard/team");
  }

  const matrix = await getPermissionMatrix(organization.id);
  const canEdit = role === "Owner" && organization.subscriptionStatus !== "suspended";

  return (
    <div className="dash-stack dash-stack--wide">
      <div>
        <p className="dash-page-eyebrow">
          <Link href="/dashboard/team">Team</Link> / Permissions
        </p>
        <h1 className="dash-page-title">Roles &amp; permissions</h1>
        <p className="dash-page-subtitle">
          Choose what each role can see and do in the desktop app. Changes apply
          to everyone with that role on their next action.{" "}
          {canEdit
            ? "Owners always have every permission."
            : "Only the Owner can change these."}
        </p>
      </div>

      <PermissionsEditor canEdit={canEdit} matrix={matrix} />
    </div>
  );
}
