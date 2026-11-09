import { AdminPaymentProviders } from "@/components/admin-payment-providers";
import { getPaymentProviders, getPaymentsOverview } from "@/lib/admin-payments";
import { formatDate, formatDateTime } from "@/lib/format-date";

const naira = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  maximumFractionDigits: 2,
});

const STATUS_LABELS: Record<string, string> = {
  succeeded: "Paid",
  pending: "Pending",
  failed: "Failed",
  abandoned: "Abandoned",
  refunded: "Refunded",
};

export default async function AdminPaymentsPage() {
  const [{ rows, totals }, providers] = await Promise.all([getPaymentsOverview(), getPaymentProviders()]);
  const providerName = (id: string | null) => providers.find((p) => p.id === id)?.name ?? id ?? "";

  return (
    <div className="dash-stack dash-stack--wide">
      <div>
        <p className="dash-page-eyebrow">Payments</p>
        <h1 className="dash-page-title">Payments</h1>
        <p className="dash-page-subtitle">
          Every payment attempt: first payments, automatic renewals, upgrades,
          failures and refunds. Refunds are made in the payment provider&apos;s
          dashboard and show here once the provider confirms them.
        </p>
      </div>

      <div className="dash-grid dash-grid--4">
        <div className="dash-card">
          <p className="dash-card-label">Collected, 30 days</p>
          <p className="dash-card-value">{naira.format(totals.collected30)}</p>
          <p className="dash-card-note">{totals.succeeded30} successful payments</p>
        </div>
        <div className="dash-card">
          <p className="dash-card-label">Collected, all time</p>
          <p className="dash-card-value">{naira.format(totals.collectedAll)}</p>
          <p className="dash-card-note">Before provider fees</p>
        </div>
        <div className="dash-card">
          <p className="dash-card-label">Failed, 30 days</p>
          <p className="dash-card-value">{totals.failed30}</p>
          <p className="dash-card-note">Declined or rejected attempts</p>
        </div>
        <div className="dash-card">
          <p className="dash-card-label">Refunded, 30 days</p>
          <p className="dash-card-value">{naira.format(totals.refunded30)}</p>
          <p className="dash-card-note">Marked when the provider confirms</p>
        </div>
      </div>

      <div className="dash-card">
        <p className="dash-card-label">Payment provider</p>
        <p className="dash-card-note" style={{ marginBottom: "1rem" }}>
          The company new payments go through. Saved cards keep renewing with the
          provider that saved them, so changing this never interrupts a
          subscription.
        </p>
        <AdminPaymentProviders providers={providers} />
      </div>

      <div className="dash-card">
        {rows.length === 0 ? (
          <p className="dash-card-note">No payments yet.</p>
        ) : (
          <div className="dash-table-wrap">
            <table className="dash-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Organization</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Type</th>
                  <th>Paid until</th>
                  <th>Reference</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td suppressHydrationWarning>
                      {formatDateTime(row.paidAt ?? row.createdAt)}
                    </td>
                    <td>{row.organizationName}</td>
                    <td>{naira.format(row.amount)}</td>
                    <td>
                      <span className="admin-stack">
                        <span
                          className={`dash-badge ${row.status === "succeeded" ? "is-active" : "is-upcoming"}`}
                        >
                          {STATUS_LABELS[row.status] ?? row.status}
                        </span>
                        {row.failureReason && (
                          <span className="admin-subline">{row.failureReason}</span>
                        )}
                      </span>
                    </td>
                    <td>
                      {row.kind === "renewal" ? "Renewal" : row.kind === "upgrade" ? "Upgrade" : "Checkout"}
                      {row.channel ? ` · ${row.channel}` : ""}
                      {row.provider ? <span className="admin-subline">{providerName(row.provider)}</span> : null}
                    </td>
                    <td suppressHydrationWarning>
                      {row.periodEnd ? formatDate(row.periodEnd) : "—"}
                    </td>
                    <td>
                      <span className="admin-subline">{row.reference}</span>
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
