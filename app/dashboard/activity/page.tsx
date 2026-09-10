import { getOrgContext } from "@/lib/org";
import { getRecentAuditLogs } from "@/lib/audit";
import { formatDateTime } from "@/lib/format-date";

const actionLabels: Record<string, string> = {
  "user.signed_up": "Account created",
  "user.signed_in": "Signed in",
  "profile.updated": "Profile updated",
  "organization.created": "Organization created",
  "subscription.activated": "Subscription activated",
};

function describeAction(action: string) {
  return actionLabels[action] ?? action;
}

export default async function DashboardActivityPage() {
  const context = await getOrgContext();
  const organizationId = context?.membership?.organization.id;
  const logs = organizationId ? await getRecentAuditLogs(organizationId) : [];

  return (
    <div className="dash-stack">
      <div>
        <p className="dash-page-eyebrow">Activity</p>
        <h1 className="dash-page-title">Audit trail</h1>
        <p className="dash-page-subtitle">
          Every change to your organization, tied to who made it and when —
          nothing here is ever silently overwritten.
        </p>
      </div>

      <div className="dash-card">
        {logs.length === 0 ? (
          <p className="dash-card-note">No activity recorded yet.</p>
        ) : (
          <div className="dash-table-wrap">
            <table className="dash-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Who</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td>{formatDateTime(log.createdAt)}</td>
                    <td>{log.actorName ?? "System"}</td>
                    <td>{describeAction(log.action)}</td>
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
