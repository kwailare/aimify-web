import { describeAuditAction, getAllAuditLogs } from "@/lib/audit";
import { formatDateTime } from "@/lib/format-date";

export default async function AdminActivityPage() {
  const logs = await getAllAuditLogs();

  return (
    <div className="dash-stack">
      <div>
        <p className="dash-page-eyebrow">Activity</p>
        <h1 className="dash-page-title">Platform-wide audit trail</h1>
        <p className="dash-page-subtitle">
          Every logged event across every organization, most recent first.
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
                  <th>Organization</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td>{formatDateTime(log.createdAt)}</td>
                    <td>{log.actorName ?? "System"}</td>
                    <td>{log.organizationName ?? "—"}</td>
                    <td>{describeAuditAction(log.action)}</td>
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
