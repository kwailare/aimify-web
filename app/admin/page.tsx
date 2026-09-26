import Link from "next/link";
import { getOverviewData } from "@/lib/admin";
import { describeAuditAction, describeAuditDetails } from "@/lib/audit";
import { formatDate, formatDateTime } from "@/lib/format-date";
import {
  SUBSCRIPTION_STATUSES,
  describeSubscriptionStatus,
  effectiveStatus,
} from "@/lib/subscription";

const naira = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  maximumFractionDigits: 0,
});

function daysLeft(date: Date) {
  const days = Math.ceil((date.getTime() - Date.now()) / (24 * 60 * 60 * 1000));

  if (days <= 0) return "ends today";
  return days === 1 ? "1 day left" : `${days} days left`;
}

type AttentionItem = { label: string; value: number; href: string };

export default async function AdminOverviewPage() {
  const data = await getOverviewData();
  const { totals, growth } = data;
  const statusTotal = Math.max(totals.organizations, 1);
  const trendMax = Math.max(
    1,
    ...data.trend.map((day) => Math.max(day.users, day.organizations)),
  );

  const attention: AttentionItem[] = [];

  if (data.endingSoon.length > 0) {
    attention.push({
      label: "Trials ending within 7 days",
      value: data.endingSoon.length,
      href: "/admin/organizations",
    });
  }

  if (data.expiredCount > 0) {
    attention.push({
      label: "Expired trials not yet subscribed",
      value: data.expiredCount,
      href: "/admin/organizations",
    });
  }

  if (data.pastDueOrganizations > 0) {
    attention.push({
      label: "Organizations past due",
      value: data.pastDueOrganizations,
      href: "/admin/organizations",
    });
  }

  if (totals.staleUnverified > 0) {
    attention.push({
      label: "Emails unconfirmed for over a day",
      value: totals.staleUnverified,
      href: "/admin/users",
    });
  }

  if ((data.statusCounts.suspended ?? 0) > 0) {
    attention.push({
      label: "Suspended organizations",
      value: data.statusCounts.suspended,
      href: "/admin/organizations",
    });
  }

  return (
    <div className="dash-stack dash-stack--wide">
      <div>
        <p className="dash-page-eyebrow">Overview</p>
        <h1 className="dash-page-title">Platform overview</h1>
        <p className="dash-page-subtitle">
          Growth, subscriptions, usage and anything that needs your attention.
        </p>
      </div>

      <div className="dash-grid dash-grid--4">
        <div className="dash-card">
          <p className="dash-card-label">Organizations</p>
          <p className="dash-card-value">{totals.organizations}</p>
          <p className="dash-card-note">
            +{growth.orgsWeek} this week · +{growth.orgsMonth} this month
          </p>
        </div>
        <div className="dash-card">
          <p className="dash-card-label">Users</p>
          <p className="dash-card-value">{totals.users}</p>
          <p className="dash-card-note">
            +{growth.usersWeek} this week · +{growth.usersMonth} this month
          </p>
        </div>
        <div className="dash-card">
          <p className="dash-card-label">Paying</p>
          <p className="dash-card-value">{data.payingOrganizations}</p>
          <p className="dash-card-note">
            Active subscriptions · about{" "}
            {naira.format(data.estimatedMonthlyRevenue)} per month
          </p>
        </div>
        <div className="dash-card">
          <p className="dash-card-label">On trial</p>
          <p className="dash-card-value">{data.statusCounts.trial ?? 0}</p>
          <p className="dash-card-note">
            {data.endingSoon.length} ending within 7 days
          </p>
        </div>
        <div className="dash-card">
          <p className="dash-card-label">Signed in today</p>
          <p className="dash-card-value">{totals.signedInToday}</p>
          <p className="dash-card-note">Distinct users in the last 24 hours</p>
        </div>
        <div className="dash-card">
          <p className="dash-card-label">Unconfirmed emails</p>
          <p className="dash-card-value">{totals.unverified}</p>
          <p className="dash-card-note">
            {totals.staleUnverified} older than a day
          </p>
        </div>
        <div className="dash-card">
          <p className="dash-card-label">Expired</p>
          <p className="dash-card-value">{data.expiredCount}</p>
          <p className="dash-card-note">Trials that ended without subscribing</p>
        </div>
        <div className="dash-card">
          <p className="dash-card-label">Suspended</p>
          <p className="dash-card-value">{data.statusCounts.suspended ?? 0}</p>
          <p className="dash-card-note">
            Blocked from the dashboard and desktop app
          </p>
        </div>
      </div>

      <div className="admin-overview-split">
        <div className="dash-card">
          <p className="dash-card-label">Needs attention</p>
          {attention.length === 0 ? (
            <p className="dash-card-note">Nothing needs attention right now.</p>
          ) : (
            <ul className="admin-attention-list">
              {attention.map((item) => (
                <li key={item.label}>
                  <Link href={item.href}>
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {data.endingSoon.length > 0 && (
            <>
              <p className="admin-detail-title">Trials ending soon</p>
              <ul className="admin-attention-list">
                {data.endingSoon.slice(0, 5).map((org) => (
                  <li key={org.id}>
                    <Link href="/admin/organizations">
                      <span>{org.name}</span>
                      <span className="admin-subline">
                        {daysLeft(org.trialEndsAt)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <div className="dash-card">
          <p className="dash-card-label">Subscriptions by status</p>
          <div className="admin-bars">
            {SUBSCRIPTION_STATUSES.map((status) => {
              const value = data.statusCounts[status] ?? 0;

              return (
                <div className="admin-bar-row" key={status}>
                  <span>{describeSubscriptionStatus(status)}</span>
                  <div className="admin-bar-track">
                    <div
                      className={`admin-bar-fill is-${status}`}
                      style={{ width: `${(value / statusTotal) * 100}%` }}
                    />
                  </div>
                  <strong>{value}</strong>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="dash-card">
        <div className="admin-stat-row">
          <p className="dash-card-label">Sign-ups, last 14 days</p>
          <span className="admin-legend">
            <span className="admin-legend-dot is-users" /> Users
            <span className="admin-legend-dot is-orgs" /> Organizations
          </span>
        </div>
        <div
          className="admin-trend"
          role="img"
          aria-label="Sign-ups per day for the last 14 days"
        >
          {data.trend.map((day) => (
            <div
              className="admin-trend-day"
              key={day.key}
              title={`${day.key}: ${day.users} users, ${day.organizations} organizations`}
            >
              <div className="admin-trend-bars">
                <div
                  className="admin-trend-bar is-users"
                  style={{ height: `${(day.users / trendMax) * 100}%` }}
                />
                <div
                  className="admin-trend-bar is-orgs"
                  style={{ height: `${(day.organizations / trendMax) * 100}%` }}
                />
              </div>
              <span>{day.key.slice(8)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="dash-grid dash-grid--4">
        <div className="dash-card">
          <p className="dash-card-label">Warehouses</p>
          <p className="dash-card-value">{totals.warehouses}</p>
          <p className="dash-card-note">Across all organizations</p>
        </div>
        <div className="dash-card">
          <p className="dash-card-label">Products</p>
          <p className="dash-card-value">{totals.products}</p>
          <p className="dash-card-note">Tracked in the desktop app</p>
        </div>
        <div className="dash-card">
          <p className="dash-card-label">Stock movements</p>
          <p className="dash-card-value">{totals.movements}</p>
          <p className="dash-card-note">In, out, adjustments and counts</p>
        </div>
        <div className="dash-card">
          <p className="dash-card-label">Audit entries</p>
          <p className="dash-card-value">{totals.auditEntries}</p>
          <p className="dash-card-note">
            <Link href="/admin/activity">Open the activity trail</Link>
          </p>
        </div>
      </div>

      <div className="admin-overview-split">
        <div className="dash-card">
          <div className="admin-stat-row">
            <p className="dash-card-label">Newest organizations</p>
            <Link className="admin-subline" href="/admin/organizations">
              View all
            </Link>
          </div>
          {data.recentSignups.length === 0 ? (
            <p className="dash-card-note">No organizations yet.</p>
          ) : (
            <ul className="admin-feed">
              {data.recentSignups.map((org) => (
                <li key={org.id}>
                  <span className="admin-stack">
                    <span>{org.name}</span>
                    <span className="admin-subline">
                      {org.industry ?? "No industry"} ·{" "}
                      {formatDate(org.createdAt)}
                    </span>
                  </span>
                  <span className="dash-badge is-upcoming">
                    {describeSubscriptionStatus(
                      effectiveStatus(org.status, org.trialEndsAt),
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="dash-card">
          <div className="admin-stat-row">
            <p className="dash-card-label">Latest activity</p>
            <Link className="admin-subline" href="/admin/activity">
              View all
            </Link>
          </div>
          {data.recentActivity.length === 0 ? (
            <p className="dash-card-note">No activity recorded yet.</p>
          ) : (
            <ul className="admin-feed">
              {data.recentActivity.map((entry) => {
                const details = describeAuditDetails(
                  entry.previousValue,
                  entry.newValue,
                );

                return (
                  <li key={entry.id}>
                    <span className="admin-stack">
                      <span>{describeAuditAction(entry.action)}</span>
                      <span className="admin-subline">
                        {entry.actorName ?? "System"}
                        {entry.organizationName
                          ? ` · ${entry.organizationName}`
                          : ""}
                        {details ? ` · ${details}` : ""}
                      </span>
                    </span>
                    <span className="admin-subline">
                      {formatDateTime(entry.createdAt)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <div className="admin-overview-split">
        <div className="dash-card">
          <div className="admin-stat-row">
            <p className="dash-card-label">Newest users</p>
            <Link className="admin-subline" href="/admin/users">
              View all
            </Link>
          </div>
          <ul className="admin-feed">
            {data.newestUsers.map((user) => (
              <li key={user.id}>
                <span className="admin-stack">
                  <span>{user.name}</span>
                  <span className="admin-subline">
                    {user.email}
                    {user.organizationName ? ` · ${user.organizationName}` : ""}
                  </span>
                </span>
                <span className="admin-stack admin-stack--end">
                  <span className="admin-subline">
                    {formatDate(user.createdAt)}
                  </span>
                  <span className="admin-subline">
                    {user.emailVerifiedAt ? "Confirmed" : "Unconfirmed"}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="dash-card">
          <p className="dash-card-label">Most active organizations, 30 days</p>
          {data.activeOrgs.length === 0 ? (
            <p className="dash-card-note">
              No organization activity has been recorded in the last 30 days.
            </p>
          ) : (
            <div className="admin-bars">
              {data.activeOrgs.map((org) => (
                <div className="admin-bar-row admin-bar-row--wide" key={org.id}>
                  <span>{org.name}</span>
                  <div className="admin-bar-track">
                    <div
                      className="admin-bar-fill"
                      style={{
                        width: `${(org.movements / data.activeOrgs[0].movements) * 100}%`,
                      }}
                    />
                  </div>
                  <strong>{org.movements}</strong>
                </div>
              ))}
            </div>
          )}
          <p className="dash-card-note" style={{ marginTop: "1rem" }}>
            Ranked by logged events such as settings changes and stock activity.
          </p>
        </div>
      </div>
    </div>
  );
}
