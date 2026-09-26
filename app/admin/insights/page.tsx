import { getInsights } from "@/lib/admin-insights";

const naira = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  maximumFractionDigits: 0,
});

function percent(value: number | null) {
  return value === null ? "No data yet" : `${value}%`;
}

export default async function AdminInsightsPage() {
  const data = await getInsights();
  const chartMax = Math.max(
    1,
    ...data.months.flatMap((month) => [
      month.signups,
      month.trialsStarted,
      month.activations,
      month.cancellations,
    ]),
  );

  return (
    <div className="dash-stack dash-stack--wide">
      <div>
        <p className="dash-page-eyebrow">Insights</p>
        <h1 className="dash-page-title">Revenue and retention</h1>
        <p className="dash-page-subtitle">
          Built from the subscription events Aimify records. Revenue is an
          estimate: each paying organization&apos;s plan price, since online
          payments aren&apos;t live yet. Churn counts cancellations of
          subscriptions that were active.
        </p>
      </div>

      <div className="dash-grid dash-grid--4">
        <div className="dash-card">
          <p className="dash-card-label">Monthly revenue (MRR)</p>
          <p className="dash-card-value">{naira.format(data.mrr)}</p>
          <p className="dash-card-note">
            {data.activeNow} paying · {naira.format(data.arr)} a year
          </p>
        </div>
        <div className="dash-card">
          <p className="dash-card-label">New MRR, 30 days</p>
          <p className="dash-card-value">{naira.format(data.newMrr)}</p>
          <p className="dash-card-note">
            {data.activations30} subscription{data.activations30 === 1 ? "" : "s"} activated
          </p>
        </div>
        <div className="dash-card">
          <p className="dash-card-label">Churned MRR, 30 days</p>
          <p className="dash-card-value">{naira.format(data.churnedMrr)}</p>
          <p className="dash-card-note">
            {data.cancelledActive30} cancelled after being active
          </p>
        </div>
        <div className="dash-card">
          <p className="dash-card-label">Net new MRR, 30 days</p>
          <p className="dash-card-value">
            {data.netNewMrr < 0 ? "-" : ""}
            {naira.format(Math.abs(data.netNewMrr))}
          </p>
          <p className="dash-card-note">New minus churned</p>
        </div>
        <div className="dash-card">
          <p className="dash-card-label">Trial-to-paid rate, 30 days</p>
          <p className="dash-card-value">{percent(data.conversionRate)}</p>
          <p className="dash-card-note">Activated out of trials that ended</p>
        </div>
        <div className="dash-card">
          <p className="dash-card-label">Churn rate, 30 days</p>
          <p className="dash-card-value">{percent(data.churnRate)}</p>
          <p className="dash-card-note">Of paying organizations at the start</p>
        </div>
        <div className="dash-card">
          <p className="dash-card-label">Average revenue per organization</p>
          <p className="dash-card-value">
            {data.arpa === null ? "No data yet" : naira.format(data.arpa)}
          </p>
          <p className="dash-card-note">Per paying organization, monthly</p>
        </div>
        <div className="dash-card">
          <p className="dash-card-label">Support response time</p>
          <p className="dash-card-value">
            {data.support.avgFirstResponseHours === null
              ? "No data yet"
              : `${data.support.avgFirstResponseHours} h`}
          </p>
          <p className="dash-card-note">
            {data.support.opened30} opened · {data.support.resolved30} resolved (30 days)
          </p>
        </div>
      </div>

      <div className="dash-card">
        <div className="admin-stat-row">
          <p className="dash-card-label">Last six months</p>
          <span className="admin-legend">
            <span className="admin-legend-dot is-users" /> Sign-ups
            <span className="admin-legend-dot is-activated" /> Activated
          </span>
        </div>
        <div className="dash-table-wrap">
          <table className="dash-table">
            <thead>
              <tr>
                <th>Month</th>
                <th>New organizations</th>
                <th>Trials started</th>
                <th>Paid activations</th>
                <th>Cancellations</th>
                <th>Trials expired</th>
                <th>Sign-ups vs activated</th>
              </tr>
            </thead>
            <tbody>
              {data.months.map((month) => (
                <tr key={month.key}>
                  <td>{month.label}</td>
                  <td>{month.signups}</td>
                  <td>{month.trialsStarted}</td>
                  <td>{month.activations}</td>
                  <td>{month.cancellations}</td>
                  <td>{month.expirations}</td>
                  <td>
                    <span className="insight-bars" aria-hidden="true">
                      <span
                        className="insight-bar is-signups"
                        style={{ width: `${(month.signups / chartMax) * 100}%` }}
                      />
                      <span
                        className="insight-bar is-activated"
                        style={{ width: `${(month.activations / chartMax) * 100}%` }}
                      />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="dash-card">
        <p className="dash-card-label">Revenue by plan</p>
        <div className="dash-table-wrap">
          <table className="dash-table">
            <thead>
              <tr>
                <th>Plan</th>
                <th>Organizations</th>
                <th>Monthly revenue</th>
              </tr>
            </thead>
            <tbody>
              {data.byPlan.map((row) => (
                <tr key={row.plan}>
                  <td>{row.plan}</td>
                  <td>{row.organizations}</td>
                  <td>{naira.format(row.mrr)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
