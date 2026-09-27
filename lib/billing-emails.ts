import { sendEmail } from "@/lib/email";
import { getBillingRecipients } from "@/lib/subscription-notices";
import { SITE_URL } from "@/lib/site";

const BILLING_URL = `${SITE_URL}/dashboard/billing`;

const naira = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  maximumFractionDigits: 2,
});

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDate(date: Date) {
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Africa/Lagos",
  });
}

async function send(
  organizationId: string,
  organizationName: string,
  subject: string,
  lines: string[],
  cta: string,
) {
  const recipients = await getBillingRecipients(organizationId);

  if (recipients.length === 0) return false;

  const text = `${lines.join("\n\n")}\n\n${cta}: ${BILLING_URL}\n\nYou're receiving this because you're an Owner or Administrator of ${organizationName} on Aimify.`;
  const html = `${lines.map((line) => `<p>${escapeHtml(line)}</p>`).join("")}<p><a href="${BILLING_URL}">${escapeHtml(cta)}</a></p><p style="color:#666;font-size:12px">You're receiving this because you're an Owner or Administrator of ${escapeHtml(organizationName)} on Aimify.</p>`;

  return sendEmail({
    to: recipients.map((recipient) => recipient.email),
    subject,
    text,
    html,
  });
}

export function sendReceiptEmail(entry: {
  organizationId: string;
  organizationName: string;
  amount: number;
  reference: string;
  periodEnd: Date;
  kind: string;
}) {
  return send(
    entry.organizationId,
    entry.organizationName,
    `Payment received for ${entry.organizationName}`,
    [
      `Thank you. We received ${naira.format(entry.amount)} for ${entry.organizationName}.`,
      `Your subscription is paid until ${formatDate(entry.periodEnd)}${entry.kind === "renewal" ? ", renewed automatically from your saved card" : ""}. Reference: ${entry.reference}.`,
    ],
    "View billing history",
  );
}

export function sendPaymentFailedEmail(entry: {
  organizationId: string;
  organizationName: string;
  amount: number;
  graceEnds: Date;
  hasCard: boolean;
}) {
  return send(
    entry.organizationId,
    entry.organizationName,
    `We couldn't renew ${entry.organizationName} on Aimify`,
    [
      entry.hasCard
        ? `We tried to charge ${naira.format(entry.amount)} to your saved card and it didn't go through.`
        : `Your subscription for ${entry.organizationName} is due for renewal (${naira.format(entry.amount)}) and no saved card is on file.`,
      `Your account stays active until ${formatDate(entry.graceEnds)} while you sort it out. After that the desktop app locks. Paying from the billing page fixes it right away.`,
    ],
    "Pay now",
  );
}

export function sendRenewalReminderEmail(entry: {
  organizationId: string;
  organizationName: string;
  amount: number;
  renewsOn: Date;
  hasCard: boolean;
}) {
  return send(
    entry.organizationId,
    entry.organizationName,
    `Your Aimify subscription renews on ${formatDate(entry.renewsOn)}`,
    [
      entry.hasCard
        ? `${naira.format(entry.amount)} will be charged to your saved card on ${formatDate(entry.renewsOn)} for ${entry.organizationName}.`
        : `Your subscription for ${entry.organizationName} renews on ${formatDate(entry.renewsOn)} (${naira.format(entry.amount)}). No card is saved, so please pay from the billing page before then to avoid interruption.`,
    ],
    "Open billing",
  );
}

export function sendLapsedEmail(entry: {
  organizationId: string;
  organizationName: string;
}) {
  return send(
    entry.organizationId,
    entry.organizationName,
    `${entry.organizationName}'s Aimify subscription has ended`,
    [
      `We couldn't collect payment, so the subscription for ${entry.organizationName} has ended and the desktop app is locked. Your data is safe and nothing was deleted.`,
      "Pay from the billing page to turn everything back on straight away.",
    ],
    "Reactivate",
  );
}
