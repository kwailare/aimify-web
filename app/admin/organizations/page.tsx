import { getAllOrganizations } from "@/lib/admin";
import { formatDate } from "@/lib/format-date";
import { OrgActionButton } from "@/components/org-action-button";

function formatStatus(status: string) {
  return status
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export default async function AdminOrganizationsPage() {
  const organizations = await getAllOrganizations();

  return (
    <div className="dash-stack">
      <div>
        <p className="dash-page-eyebrow">Organizations</p>
        <h1 className="dash-page-title">All organizations</h1>
        <p className="dash-page-subtitle">
          {organizations.length} organization
          {organizations.length === 1 ? "" : "s"} on the platform.
        </p>
      </div>

      <div className="dash-card">
        {organizations.length === 0 ? (
          <p className="dash-card-note">No organizations yet.</p>
        ) : (
          <div className="dash-table-wrap">
            <table className="dash-table">
              <thead>
                <tr>
                  <th>Organization</th>
                  <th>Members</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {organizations.map((org) => (
                  <tr key={org.id}>
                    <td>{org.name}</td>
                    <td>{org.memberCount}</td>
                    <td>
                      <span
                        className={`dash-badge ${
                          org.subscriptionStatus === "suspended"
                            ? "is-upcoming"
                            : "is-active"
                        }`}
                      >
                        {formatStatus(org.subscriptionStatus)}
                      </span>
                    </td>
                    <td>{formatDate(org.createdAt)}</td>
                    <td>
                      <OrgActionButton
                        organizationId={org.id}
                        status={org.subscriptionStatus}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
