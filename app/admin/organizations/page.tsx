import { getAllOrganizations } from "@/lib/admin";
import { formatDate } from "@/lib/format-date";
import { OrgActionButton } from "@/components/org-action-button";
import {
  describeSubscriptionStatus,
  effectiveStatus,
  hasProductAccess,
} from "@/lib/subscription";

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
                {organizations.map((org) => {
                  const status = effectiveStatus(
                    org.subscriptionStatus,
                    org.trialEndsAt,
                  );

                  return (
                  <tr key={org.id}>
                    <td>{org.name}</td>
                    <td>{org.memberCount}</td>
                    <td>
                      <span
                        className={`dash-badge ${
                          hasProductAccess(status) ? "is-active" : "is-upcoming"
                        }`}
                      >
                        {describeSubscriptionStatus(status)}
                      </span>
                    </td>
                    <td>{formatDate(org.createdAt)}</td>
                    <td>
                      <OrgActionButton
                        organizationId={org.id}
                        status={status}
                      />
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
