"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { saveWhatsAppSettingsAction, setMyWhatsAppAlertsAction } from "@/lib/actions/whatsapp";
import { REMINDER_DAY_CHOICES, type WhatsAppSettings } from "@/lib/whatsapp/settings";

type Notice = { kind: "error" | "success"; text: string } | null;

const SWITCHES: { key: keyof WhatsAppSettings; label: string; detail: string }[] = [
  { key: "invoices", label: "Invoices", detail: "After a sale, the invoice to the customer: total, paid and balance." },
  { key: "receipts", label: "Receipts", detail: "After a payment, a receipt to the customer with their new balance." },
  { key: "reminders", label: "Reminders of overdue amounts", detail: "A polite reminder to customers with overdue amounts." },
  { key: "purchaseOrders", label: "Purchase orders", detail: "When a purchase is placed, the order to the supplier." },
  { key: "stockAlerts", label: "Stock alerts", detail: "Low and out of stock alerts to team members who turn them on below." },
];

/**
 * The business's automatic WhatsApp messages (Owner and Administrators
 * change them), and the signed-in person's own stock alerts.
 */
export function WhatsAppSettingsForm({
  settings,
  canEdit,
  myAlerts,
  myPhone,
}: {
  settings: WhatsAppSettings;
  canEdit: boolean;
  myAlerts: boolean;
  myPhone: string | null;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState(settings);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);

  const save = async () => {
    setNotice(null);
    setBusy("save");
    const result = await saveWhatsAppSettingsAction(draft);
    setBusy(null);
    if (result?.error) return setNotice({ kind: "error", text: result.error });
    setNotice({ kind: "success", text: "WhatsApp messages saved." });
    router.refresh();
  };

  const toggleMine = async () => {
    setNotice(null);
    setBusy("mine");
    const result = await setMyWhatsAppAlertsAction(!myAlerts);
    setBusy(null);
    if (result?.error) return setNotice({ kind: "error", text: result.error });
    setNotice({ kind: "success", text: myAlerts ? "You won't get stock alerts on WhatsApp." : "You'll get stock alerts on WhatsApp." });
    router.refresh();
  };

  return (
    <div className="dash-stack">
      {notice && (
        <p className={notice.kind === "error" ? "auth-error" : "auth-success"} role={notice.kind === "error" ? "alert" : "status"}>
          {notice.text}
        </p>
      )}

      <div className="dash-card">
        <p className="dash-card-label">Messages your business sends</p>
        <fieldset className="dash-fieldset" disabled={!canEdit || busy !== null}>
          <div className="whatsapp-switches">
            {SWITCHES.map((s) => (
              <label className="auth-checkbox-row" key={s.key}>
                <input
                  type="checkbox"
                  name={s.key}
                  checked={draft[s.key] === true}
                  onChange={(e) => setDraft({ ...draft, [s.key]: e.target.checked })}
                />
                <span>
                  <b>{s.label}</b>
                  <span className="admin-subline">{s.detail}</span>
                </span>
              </label>
            ))}
          </div>
          <div className="auth-field" style={{ maxWidth: 280, marginTop: "0.75rem" }}>
            <label className="auth-label" htmlFor="whatsapp-reminder-days">
              Remind a customer at most every
            </label>
            <select
              id="whatsapp-reminder-days"
              className="auth-input"
              value={draft.reminderEveryDays}
              onChange={(e) => setDraft({ ...draft, reminderEveryDays: Number(e.target.value) })}
            >
              {REMINDER_DAY_CHOICES.map((d) => (
                <option key={d} value={d}>
                  {d} days
                </option>
              ))}
            </select>
          </div>
          {canEdit && (
            <button className="auth-submit dash-submit" type="button" onClick={save} style={{ marginTop: "1rem" }}>
              {busy === "save" ? "Saving…" : "Save"}
            </button>
          )}
        </fieldset>
        {!canEdit && <p className="dash-card-note">Only an Owner or Administrator can change these.</p>}
        <p className="dash-card-note" style={{ marginTop: "0.75rem" }}>
          Customers and suppliers only get these if they agreed: tick &ldquo;WhatsApp OK&rdquo; on them in the desktop
          app. The &ldquo;Send on WhatsApp&rdquo; buttons in the app always work, from your own WhatsApp.
        </p>
      </div>

      <div className="dash-card">
        <p className="dash-card-label">Your stock alerts</p>
        <p className="dash-card-note">
          {myAlerts
            ? `You get low and out of stock alerts on WhatsApp at ${myPhone}.`
            : "Get low and out of stock alerts on WhatsApp, at the phone number in your Settings."}
        </p>
        <button
          className="dash-table-action"
          type="button"
          disabled={busy !== null}
          onClick={toggleMine}
          data-testid="my-whatsapp-alerts"
        >
          {busy === "mine" ? "Working…" : myAlerts ? "Turn off my stock alerts" : "Turn on my stock alerts"}
        </button>
      </div>
    </div>
  );
}
