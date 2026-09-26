import { AdminActivityTable } from "@/components/admin-activity-table";
import {
  describeAuditAction,
  describeAuditDetails,
  getAllAuditLogs,
  getAuditStats,
} from "@/lib/audit";

const LIMITS = [100, 250, 500, 1000];

export default async function AdminActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ limit?: string }>;
}) {
  const { limit: rawLimit } = await searchParams;
  const requested = Number(rawLimit);
  const limit = LIMITS.includes(requested) ? requested : LIMITS[0];

  const [logs, stats] = await Promise.all([
    getAllAuditLogs(limit),
    getAuditStats(),
  ]);

  const rows = logs.map((log) => ({
    id: log.id,
    createdAt: log.createdAt,
    actorName: log.actorName,
    actorEmail: log.actorEmail,
    organizationName: log.organizationName,
    module: log.module,
    label: describeAuditAction(log.action),
    details: describeAuditDetails(log.previousValue, log.newValue),
  }));

  const nextLimit =
    stats.total > logs.length ? (LIMITS.find((value) => value > limit) ?? null) : null;

  return (
    <div className="dash-stack">
      <div>
        <p className="dash-page-eyebrow">Activity</p>
        <h1 className="dash-page-title">Platform-wide audit trail</h1>
        <p className="dash-page-subtitle">
          Every logged event across every organization, most recent first. Use
          Clear history to free up space; clearing is itself recorded.
        </p>
      </div>

      <AdminActivityTable
        rows={rows}
        total={stats.total}
        oldest={stats.oldest}
        nextLimit={nextLimit}
      />
    </div>
  );
}
