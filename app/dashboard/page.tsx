import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowUpRight, Check, X } from "lucide-react";
import { getDashboardOverview } from "@/lib/dashboard-overview";
import { getOrgContext } from "@/lib/org";
import { describeAuditAction, describeAuditDetails } from "@/lib/audit";
import { formatDate, formatDateTime } from "@/lib/format-date";
import { describeSubscriptionStatus, hasProductAccess } from "@/lib/subscription";

const MOVEMENT_LABELS: Record<string, string> = {
  stock_in: "Stock in",
  stock_out: "Stock out",
  adjustment: "Adjustment",
  count: "Stock count",
};

function daysLeft(date: Date) {
  const days = Math.ceil((date.getTime() - Date.now()) / (24 * 60 * 60 * 1000));

  if (days <= 0) return "ends today";
  return days === 1 ? "1 day left" : `${days} days left`;
}

export default async function DashboardOverviewPage() {
  const context = await getOrgContext();

  if (!context?.membership) {
    redirect("/signin");
  }

  const { user } = context;
  const { organization, role } = context.membership;
  const data = await getDashboardOverview(organization.id);

  const firstName = user.name.split(" ")[0] || "there";
  const status = organization.subscriptionStatus;
  const isSubscribed = hasProductAccess(status);
  const money = (value: number) =>
    `${organization.currency} ${Math.round(value).toLocaleString("en-US")}`;

  const subscriptionNote =
    status === "trial" && organization.trialEndsAt
      ? `Trial ends ${formatDate(organization.trialEndsAt)} · ₦25,000 / month after`
      : status === "expired" && organization.trialEndsAt
        ? `Free trial ended ${formatDate(organization.trialEndsAt)}`
        : status === "active"
          ? "₦25,000 / month"
          : describeSubscriptionStatus(status);

  const profileComplete = Boolean(
    organization.registrationNumber &&
      organization.address &&
      organization.phone,
  );

  const steps = [
    { label: "Profile created", done: true, href: "/dashboard/settings" },
    { label: "Organization created", done: true, href: "/dashboard/organization" },
    {
      label: isSubscribed
        ? "Subscription active"
        : `Subscription ${describeSubscriptionStatus(status).toLowerCase()}`,
      done: isSubscribed,
      href: "/dashboard/billing",
    },
    {
      label: "Company profile completed",
      done: profileComplete,
      href: "/dashboard/organization",
    },
    {
      label: "Company logo uploaded",
      done: Boolean(organization.logoUrl),
      href: "/dashboard/organization",
    },
    {
      label: "First product added",
      done: data.products + data.archivedProducts > 0,
      href: "/dashboard/download",
    },
    {
      label: "First stock movement recorded",
      done: data.movementsTotal > 0,
      href: "/dashboard/download",
    },
  ];
  const completed = steps.filter((step) => step.done).length;

  const trendMax = Math.max(
    1,
    ...data.trend.map((day) => Math.max(day.incoming, day.outgoing)),
  );
  const categoryMax = Math.max(1, ...data.categories.map((c) => c.products));
  const attentionCount = data.lowStockCount + data.outOfStockCount;

  return (
    <div className="dash-stack">
      <div>
        <p className="dash-page-eyebrow">Overview</p>
        <h1 className="dash-page-title">Welcome back, {firstName}</h1>
        <p className="dash-page-subtitle">
          Here&apos;s the current state of {organization.name}&apos;s stock and
          Aimify account.
        </p>
      </div>

      <div className="dash-promo">
        <div>
          <p className="dash-promo-title">
            {data.movementsTotal === 0
              ? "Your desktop app is ready"
              : "Keep stock moving in the desktop app"}
          </p>
          <p className="dash-promo-copy">
            {data.movementsTotal === 0
              ? "Inventory, sales, purchases and credit all live in the Aimify desktop app. Download it to start managing stock."
              : `${data.movementsWeek} stock ${data.movementsWeek === 1 ? "movement" : "movements"} recorded in the last 7 days${data.lastMovementAt ? `, the latest on ${formatDateTime(data.lastMovementAt)}` : ""}.`}
          </p>
        </div>
        <Link className="hero-primary" href="/dashboard/download">
          Go to download
          <ArrowUpRight size={16} aria-hidden="true" />
        </Link>
      </div>

      <div className="dash-grid dash-grid--4">
        <div className="dash-card">
          <p className="dash-card-label">Products</p>
          <p className="dash-card-value">{data.products}</p>
          <p className="dash-card-note">
            {data.archivedProducts} archived
          </p>
        </div>
        <div className="dash-card">
          <p className="dash-card-label">Units in stock</p>
          <p className="dash-card-value">
            {data.unitsInStock.toLocaleString("en-US")}
          </p>
          <p className="dash-card-note">Across all active products</p>
        </div>
        <div className="dash-card">
          <p className="dash-card-label">Stock value (cost)</p>
          <p className="dash-card-value">{money(data.costValue)}</p>
          <p className="dash-card-note">Units times purchase price</p>
        </div>
        <div className="dash-card">
          <p className="dash-card-label">Stock value (retail)</p>
          <p className="dash-card-value">{money(data.retailValue)}</p>
          <p className="dash-card-note">
            Potential margin {money(data.retailValue - data.costValue)}
          </p>
        </div>
        <div className="dash-card">
          <p className="dash-card-label">Low stock</p>
          <p className="dash-card-value">{data.lowStockCount}</p>
          <p className="dash-card-note">At or under the minimum level</p>
        </div>
        <div className="dash-card">
          <p className="dash-card-label">Out of stock</p>
          <p className="dash-card-value">{data.outOfStockCount}</p>
          <p className="dash-card-note">Active products with no stock</p>
        </div>
        <div className="dash-card">
          <p className="dash-card-label">Warehouses</p>
          <p className="dash-card-value">{data.warehouses}</p>
          <p className="dash-card-note">{data.activeWarehouses} active</p>
        </div>
        <div className="dash-card">
          <p className="dash-card-label">Team</p>
          <p className="dash-card-value">{data.members}</p>
          <p className="dash-card-note">
            {data.members === 1 ? "Member" : "Members"} · you are {role}
          </p>
        </div>
      </div>

      <div className="admin-overview-split">
        <div className="dash-card">
          <p className="dash-card-label">Stock needing attention</p>
          {attentionCount === 0 ? (
            <p className="dash-card-note">
              {data.products === 0
                ? "Add products in the desktop app to see stock alerts here."
                : "Every product is above its minimum level."}
            </p>
          ) : (
            <ul className="admin-feed">
              {data.outOfStock.map((product) => (
                <li key={product.id}>
                  <span className="admin-stack">
                    <span>{product.name}</span>
                    <span className="admin-subline">{product.sku}</span>
                  </span>
                  <span className="dash-badge is-upcoming">Out of stock</span>
                </li>
              ))}
              {data.lowStock.map((product) => (
                <li key={product.id}>
                  <span className="admin-stack">
                    <span>{product.name}</span>
                    <span className="admin-subline">
                      {product.currentStock} left · minimum {product.minStock}
                    </span>
                  </span>
                  <span className="dash-badge is-active">Low stock</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="dash-card">
          <p className="dash-card-label">Most valuable stock</p>
          {data.topProducts.length === 0 ? (
            <p className="dash-card-note">No products yet.</p>
          ) : (
            <ul className="admin-feed">
              {data.topProducts.map((product) => (
                <li key={product.id}>
                  <span className="admin-stack">
                    <span>{product.name}</span>
                    <span className="admin-subline">
                      {product.currentStock} {product.unit} on hand
                    </span>
                  </span>
                  <strong>{money(product.value)}</strong>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="dash-card">
        <div className="admin-stat-row">
          <p className="dash-card-label">Stock flow, last 14 days</p>
          <span className="admin-legend">
            <span className="admin-legend-dot is-users" /> Units in
            <span className="admin-legend-dot is-orgs" /> Units out
          </span>
        </div>
        <div
          className="admin-trend"
          role="img"
          aria-label="Units received and sent out per day for the last 14 days"
        >
          {data.trend.map((day) => (
            <div
              className="admin-trend-day"
              key={day.key}
              title={`${day.key}: ${day.incoming} in, ${day.outgoing} out`}
            >
              <div className="admin-trend-bars">
                <div
                  className="admin-trend-bar is-users"
                  style={{ height: `${(day.incoming / trendMax) * 100}%` }}
                />
                <div
                  className="admin-trend-bar is-orgs"
                  style={{ height: `${(day.outgoing / trendMax) * 100}%` }}
                />
              </div>
              <span>{day.key.slice(8)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="admin-overview-split">
        <div className="dash-card">
          <div className="admin-stat-row">
            <p className="dash-card-label">Recent stock movements</p>
            <Link className="admin-subline" href="/dashboard/activity">
              View activity
            </Link>
          </div>
          {data.recentMovements.length === 0 ? (
            <p className="dash-card-note">
              No stock movements yet. They appear here as soon as the desktop
              app records one.
            </p>
          ) : (
            <ul className="admin-feed">
              {data.recentMovements.map((movement) => (
                <li key={movement.id}>
                  <span className="admin-stack">
                    <span>{movement.productName}</span>
                    <span className="admin-subline">
                      {MOVEMENT_LABELS[movement.type] ?? movement.type} ·{" "}
                      {movement.quantity > 0 ? "+" : ""}
                      {movement.quantity} {movement.unit} → {movement.newStock}{" "}
                      on hand · {movement.userName ?? "System"}
                    </span>
                  </span>
                  <span className="admin-subline">
                    {formatDateTime(movement.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="dash-card">
          <p className="dash-card-label">Products by category</p>
          {data.categories.length === 0 ? (
            <p className="dash-card-note">No products yet.</p>
          ) : (
            <div className="admin-bars">
              {data.categories.map((row) => (
                <div className="admin-bar-row" key={row.category}>
                  <span>{row.category}</span>
                  <div className="admin-bar-track">
                    <div
                      className="admin-bar-fill"
                      style={{ width: `${(row.products / categoryMax) * 100}%` }}
                    />
                  </div>
                  <strong>{row.products}</strong>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="dash-grid">
        <div className="dash-card">
          <p className="dash-card-label">Organization</p>
          <p className="dash-card-value">{organization.name}</p>
          <p className="dash-card-note">
            {organization.industry ?? "No industry set"} ·{" "}
            {organization.currency} · {organization.timezone}
          </p>
        </div>
        <div className="dash-card">
          <p className="dash-card-label">Subscription</p>
          <p className="dash-card-value">
            {describeSubscriptionStatus(status)}
          </p>
          <p className="dash-card-note">
            {subscriptionNote}
            {status === "trial" && organization.trialEndsAt
              ? ` · ${daysLeft(organization.trialEndsAt)}`
              : ""}
          </p>
        </div>
        <div className="dash-card">
          <p className="dash-card-label">Member since</p>
          <p className="dash-card-value">{formatDate(organization.createdAt)}</p>
          <p className="dash-card-note">Signed in as {user.email}</p>
        </div>
      </div>

      <div className="admin-overview-split">
        <div className="dash-card">
          <div className="admin-stat-row">
            <p className="dash-card-label">Getting started</p>
            <span className="admin-subline">
              {completed} of {steps.length} done
            </span>
          </div>
          <div className="admin-bar-track" style={{ marginTop: "0.8rem" }}>
            <div
              className="admin-bar-fill is-active"
              style={{ width: `${(completed / steps.length) * 100}%` }}
            />
          </div>
          <ul className="dash-status-list">
            {steps.map((step) => (
              <li className={step.done ? "is-done" : undefined} key={step.label}>
                {step.done ? (
                  <Check size={14} aria-hidden="true" />
                ) : (
                  <X size={14} aria-hidden="true" />
                )}{" "}
                {step.done ? (
                  step.label
                ) : (
                  <Link href={step.href}>{step.label}</Link>
                )}
              </li>
            ))}
          </ul>
        </div>

        <div className="dash-card">
          <div className="admin-stat-row">
            <p className="dash-card-label">Account activity</p>
            <Link className="admin-subline" href="/dashboard/activity">
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
    </div>
  );
}
