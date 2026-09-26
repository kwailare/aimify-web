import { AdminOrganizationsTable } from "@/components/admin-organizations-table";
import { getAdminPlans, getAllOrganizations } from "@/lib/admin";

export default async function AdminOrganizationsPage() {
  const [organizations, allPlans] = await Promise.all([
    getAllOrganizations(),
    getAdminPlans(),
  ]);

  return (
    <div className="dash-stack">
      <div>
        <p className="dash-page-eyebrow">Organizations</p>
        <h1 className="dash-page-title">All organizations</h1>
        <p className="dash-page-subtitle">
          {organizations.length} organization
          {organizations.length === 1 ? "" : "s"} on the platform. Open an
          organization to see its company profile, members and recent
          activity, and to extend a trial, activate a subscription by hand,
          or suspend it.
        </p>
      </div>

      <AdminOrganizationsTable
        organizations={organizations}
        plans={allPlans
          .filter((plan) => plan.isActive)
          .map((plan) => ({ id: plan.id, name: plan.name }))}
      />
    </div>
  );
}
