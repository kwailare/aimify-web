import { desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { WhatsAppSettingsForm } from "@/components/whatsapp-settings-form";
import { db } from "@/db";
import { whatsappMessages } from "@/db/schema";
import { formatDateTime } from "@/lib/format-date";
import { getOrgContext } from "@/lib/org";
import { canManageTeam } from "@/lib/roles";
import { whatsappProvider } from "@/lib/whatsapp";
import { readWhatsAppSettings } from "@/lib/whatsapp/settings";

const KIND_LABELS: Record<string, string> = {
  invoice: "Invoice",
  receipt: "Receipt",
  reminder: "Reminder",
  purchase_order: "Purchase order",
  stock_alert: "Stock alert",
};

const STATUS_LABELS: Record<string, string> = {
  sending: "Sending",
  sent: "Sent",
  delivered: "Delivered",
  read: "Read",
  failed: "Failed",
  recorded: "Recorded (test)",
};

export default async function DashboardWhatsAppPage() {
  const context = await getOrgContext();
  if (!context?.membership) redirect("/signin");
  const { organization, role } = context.membership;
  const canEdit = canManageTeam(role);
  const provider = whatsappProvider();
  const recent = canEdit
    ? await db
        .select()
        .from(whatsappMessages)
        .where(eq(whatsappMessages.organizationId, organization.id))
        .orderBy(desc(whatsappMessages.createdAt))
        .limit(50)
    : [];

  return (
    <div className="dash-stack">
      <div>
        <p className="dash-page-eyebrow">WhatsApp</p>
        <h1 className="dash-page-title">WhatsApp messages</h1>
        <p className="dash-page-subtitle">
          Invoices, receipts, reminders, purchase orders and stock alerts sent automatically on WhatsApp.
        </p>
      </div>

      <div className="dash-card" data-testid="whatsapp-status">
        <p className="dash-card-label">Status</p>
        {provider === null ? (
          <p className="dash-card-note">
            Automatic WhatsApp messages aren&apos;t switched on for Aimify yet. You can choose your messages now; they
            start once it is. Meanwhile, use &ldquo;Send on WhatsApp&rdquo; in the desktop app to send from your own
            WhatsApp.
          </p>
        ) : provider.id === "record" ? (
          <p className="dash-card-note">
            Test mode: messages are recorded below but not sent to anyone.
          </p>
        ) : (
          <p className="dash-card-note">Connected. Messages go from Aimify&apos;s WhatsApp Business number and name your business.</p>
        )}
      </div>

      <WhatsAppSettingsForm
        settings={readWhatsAppSettings(organization.whatsappSettings)}
        canEdit={canEdit}
        myAlerts={context.user.whatsappAlerts}
        myPhone={context.user.phone}
      />

      {canEdit && (
        <div className="dash-card">
          <p className="dash-card-label">Recent messages</p>
          {recent.length === 0 ? (
            <p className="dash-empty">No WhatsApp messages yet.</p>
          ) : (
            <div className="dash-table-wrap">
              <table className="dash-table">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Message</th>
                    <th>To</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((m) => (
                    <tr key={m.id} data-kind={m.kind}>
                      <td suppressHydrationWarning>{formatDateTime(m.createdAt)}</td>
                      <td>
                        <span className="admin-stack">
                          <b>{KIND_LABELS[m.kind] ?? m.kind}</b>
                          <span className="admin-subline">{m.body}</span>
                        </span>
                      </td>
                      <td>+{m.toPhone}</td>
                      <td>
                        <span className="admin-stack">
                          <span className={`dash-badge ${m.status === "failed" ? "is-upcoming" : "is-active"}`}>
                            {STATUS_LABELS[m.status] ?? m.status}
                          </span>
                          {m.error && <span className="admin-subline">{m.error}</span>}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
