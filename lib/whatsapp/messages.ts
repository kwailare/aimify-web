// The automatic WhatsApp messages: each is an approved template (its exact
// text is in docs/whatsapp-setup.md) filled with these parameters, in
// order. `text` is the same message as the recipient reads it, kept in the
// message log.

export type BuiltMessage = { template: string; params: string[]; text: string };

const naira = (amount: number) => `₦${Number(amount).toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;
const day = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Lagos" });
// WhatsApp template parameters can't hold new lines or long runs of spaces.
const clean = (s: string) => s.replace(/\s+/g, " ").trim();

function build(template: string, wording: (p: string[]) => string, params: string[]): BuiltMessage {
  const cleaned = params.map(clean);
  return { template, params: cleaned, text: wording(cleaned) };
}

export function invoiceMessage(m: { customer: string; business: string; reference: string; total: number; paid: number }) {
  return build(
    "aimify_invoice",
    (p) => `Hello ${p[0]}, thank you for buying from ${p[1]}. Invoice ${p[2]}: total ${p[3]}, paid ${p[4]}, balance ${p[5]}.`,
    [m.customer, m.business, m.reference, naira(m.total), naira(m.paid), naira(Math.max(m.total - m.paid, 0))],
  );
}

export function receiptMessage(m: { customer: string; business: string; amount: number; reference: string; balance: number }) {
  return build(
    "aimify_receipt",
    (p) => `Hello ${p[0]}, ${p[1]} received your payment of ${p[2]} (${p[3]}). Your balance is now ${p[4]}. Thank you.`,
    [m.customer, m.business, naira(m.amount), m.reference, naira(Math.max(m.balance, 0))],
  );
}

export function reminderMessage(m: { customer: string; business: string; overdue: number; oldestDue: Date }) {
  return build(
    "aimify_payment_reminder",
    (p) =>
      `Hello ${p[0]}, this is a friendly reminder from ${p[1]}: ${p[2]} is overdue on your account (due since ${p[3]}). Please get in touch to arrange payment. Thank you.`,
    [m.customer, m.business, naira(m.overdue), day(m.oldestDue)],
  );
}

export function purchaseOrderMessage(m: {
  supplier: string;
  business: string;
  reference: string;
  lines: { name: string; unit: string; quantity: number }[];
  total: number;
}) {
  const shown = m.lines.slice(0, 8).map((l) => `${l.quantity} ${l.unit} ${l.name}`);
  const more = m.lines.length > shown.length ? `, and ${m.lines.length - shown.length} more` : "";
  return build(
    "aimify_purchase_order",
    (p) => `Hello ${p[0]}, ${p[1]} would like to order (purchase order ${p[2]}): ${p[3]}. Total ${p[4]}. Please confirm. Thank you.`,
    [m.supplier, m.business, m.reference, `${shown.join("; ")}${more}`, naira(m.total)],
  );
}

export function stockAlertMessage(m: {
  business: string;
  product: string;
  sku: string;
  out: boolean;
  left: number;
  minimum: number;
}) {
  return build(
    "aimify_stock_alert",
    (p) => `${p[0]}: ${p[1]} is ${p[2]} (${p[3]} left, minimum ${p[4]}). Open Aimify to reorder.`,
    [m.business, `${m.product} (${m.sku})`, m.out ? "out of stock" : "running low", String(m.left), String(m.minimum)],
  );
}
