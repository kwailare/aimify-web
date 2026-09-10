import { getPlatformStats } from "@/lib/admin";

export default async function AdminOverviewPage() {
  const stats = await getPlatformStats();

  return (
    <div className="dash-stack">
      <div>
        <p className="dash-page-eyebrow">Overview</p>
        <h1 className="dash-page-title">Platform overview</h1>
        <p className="dash-page-subtitle">
          Every organization on Aimify, at a glance.
        </p>
      </div>

      <div className="dash-grid dash-grid--4">
        <div className="dash-card">
          <p className="dash-card-label">Organizations</p>
          <p className="dash-card-value">{stats.totalOrganizations}</p>
          <p className="dash-card-note">Total registered</p>
        </div>
        <div className="dash-card">
          <p className="dash-card-label">Users</p>
          <p className="dash-card-value">{stats.totalUsers}</p>
          <p className="dash-card-note">Across all organizations</p>
        </div>
        <div className="dash-card">
          <p className="dash-card-label">On trial</p>
          <p className="dash-card-value">{stats.trialOrganizations}</p>
          <p className="dash-card-note">Active 14-day trials</p>
        </div>
        <div className="dash-card">
          <p className="dash-card-label">Suspended</p>
          <p className="dash-card-value">{stats.suspendedOrganizations}</p>
          <p className="dash-card-note">Blocked from the dashboard</p>
        </div>
      </div>
    </div>
  );
}
