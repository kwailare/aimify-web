import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const AS_OF = "21 October 2026";
const OUT = path.resolve("docs/aimify-feature-checklist.pdf");

const D = "done";
const P = "partial";
const N = "todo";

const MODULES = [
  {
    title: "Authentication & Account Management",
    phase: "MVP",
    items: [
      [D, "Sign up, login, logout, password reset", "Web and desktop. Login is rate-limited; reset link is single-use and lasts 1 hour."],
      [D, "Email verification", "Link valid 24 hours, can be resent; admins can verify by hand."],
      [N, "Phone verification where required", "Deferred on 21 Oct 2026. When built: owners only, at onboarding; SMS provider still to choose."],
      [D, "Session management and profile management", "Signed-in devices list, sign out one or all; name and phone editable and audited."],
      [D, "Two-factor authentication", "Authenticator app with QR setup and 10 backup codes, on web and desktop. Delivered early (planned as a later pass)."],
    ],
  },
  {
    title: "Organization Management",
    phase: "MVP",
    items: [
      [D, "Company profile: name, registration number, address, phone, email, logo", "Logo stored on Vercel Blob."],
      [D, "Industry, currency, tax configuration, date format, time zone", "All editable on the Organization page."],
      [D, "Every transaction tied to its organization ID (tenant isolation)", "Enforced in every query (application level)."],
      [D, "Guided setup wizard", "Website: profile, organization, first warehouse, trial, download. Desktop: a guided flow through company & warehouse, products, opening stock, team invitations and subscription, opening automatically for Owners and Administrators until finished."],
    ],
  },
  {
    title: "User & Permission System (RBAC)",
    phase: "MVP",
    items: [
      [D, "Six roles: Owner, Administrator, Warehouse Manager, Sales Staff, Inventory Staff, Accountant/Finance", "Enforced on the website, in the API and in which desktop screens are visible."],
      [D, "Granular per-module permissions (view / create / edit / delete)", "View, add, edit and archive/delete per module (products, categories & units, stock in/out/adjust, warehouses, customers, suppliers, credit), checked on every API call and deciding which desktop screens and buttons show."],
      [D, "Owner can assign roles and permissions to staff", "Owners and Administrators invite people and change roles; the Owner edits each role's permissions on the website (Team, then Roles & permissions), with reset to defaults and an audit trail. Set per role, not per person."],
    ],
  },
  {
    title: "Product Management",
    phase: "MVP",
    items: [
      [P, "Full product record (SKU, barcode, name, description, category, brand, unit, prices, min/max stock, current stock, image, supplier, status)", "Everything except the supplier link. The suppliers table now exists, so this can be added."],
      [D, "Configurable units of measurement", "Defaults seeded; custom units per organization."],
      [D, "Product categories", "Configurable per organization. Desktop also has bulk import from Excel."],
    ],
  },
  {
    title: "Inventory Management",
    phase: "MVP",
    items: [
      [D, "Real-time current stock per product", ""],
      [D, "Stock in, stock out, stock adjustment, stock count", "Atomic updates; roles limit which types each person can record."],
      [D, "Full stock movement history (never a silent overwrite)", "Ledger records before/after stock, user and reason."],
      [D, "Low-stock and out-of-stock alerts", "Returned by the API, listed in the desktop app and emailed."],
      [P, "Inventory valuation", "Stock value at cost and retail is shown on the web dashboard and desktop reports. No valuation report or per-warehouse valuation."],
    ],
  },
  {
    title: "Warehouse Management",
    phase: "MVP",
    items: [
      [D, "Warehouse profile: name, address, manager, phone, status", ""],
      [D, "Create, edit, disable warehouses", ""],
      [N, "Per-warehouse stock view and valuation", "Stock is held organization-wide on each product."],
      [D, "Single warehouse in MVP", "Enforced by plan limits (one active warehouse on the default plan)."],
    ],
  },
  {
    title: "Stock Transfer",
    phase: "Phase 2",
    items: [
      [N, "Transfer products between warehouses (source, destination, quantity, date, user, reason)", "Needs per-warehouse stock first."],
      [N, "Reference number and transfer status per transfer", ""],
    ],
  },
  {
    title: "Purchase Management",
    phase: "MVP",
    items: [
      [P, "Purchase record (supplier, warehouse, products, quantity, unit cost, discount, tax, total, payment status, paid, balance, date, user)", "Desktop records supplier, items, unit cost, payment status, amount paid and balance, saved on that computer only. No warehouse, discount, tax or user, and nothing on the backend."],
      [N, "Purchase statuses: draft, pending, received, partially received, cancelled", ""],
      [N, "Receiving a purchase automatically increases inventory", "Purchases don't touch stock yet."],
    ],
  },
  {
    title: "Sales Management",
    phase: "MVP",
    items: [
      [N, "Sales record (invoice number, customer, warehouse, products, prices, discount, tax, total, paid, balance, payment method, salesperson)", "No sales module in the desktop app or backend. Sales Staff can only record stock-out."],
      [N, "Completing a sale automatically decreases inventory", ""],
    ],
  },
  {
    title: "Customer Management",
    phase: "MVP",
    items: [
      [P, "Customer record: name, phone, email, address, customer type, credit limit, current balance, status", "Everything except customer type. Synced to the backend."],
      [P, "Full transaction history: purchases, payments, balances, credit sales, returns", "Credit ledger history (charges, payments, adjustments). No sales or returns to show yet."],
    ],
  },
  {
    title: "Credit Sales & Debt Management",
    phase: "MVP",
    items: [
      [D, "Record credit sales and repayments", "Shared ledger; safe against double-posting and simultaneous payments."],
      [P, "Track outstanding balances and set customer credit limits", "Balances are tracked and a limit can be set, but a charge over the limit isn't blocked or warned."],
      [P, "Customer debt history, debt reports, receipts", "History per customer is there. No debt report or printable receipt."],
    ],
  },
  {
    title: "Supplier Management",
    phase: "MVP",
    items: [
      [P, "Supplier record: name, phone, email, address, contact person, products supplied, outstanding balance", "Everything except products supplied. Synced to the backend."],
      [P, "Supplier history: purchases, payments, returns, balances", "Payments and balance via the credit ledger. Purchases aren't linked (they're local only)."],
    ],
  },
  {
    title: "Expense Management",
    phase: "MVP",
    items: [
      [P, "Record expenses by category", "In the desktop app, saved on that computer only. Not synced."],
      [P, "Expense fields: category, description, amount, date, payment method, warehouse, user, receipt", "Has category, note, amount, date and payment method. No warehouse, user or receipt attachment."],
    ],
  },
  {
    title: "Returns Management",
    phase: "Phase 2",
    items: [
      [N, "Sales returns (inventory increases)", ""],
      [N, "Purchase returns (inventory decreases)", ""],
      [N, "Every return references its original transaction", ""],
    ],
  },
  {
    title: "Dashboard & Analytics",
    phase: "MVP",
    items: [
      [P, "Key cards (products, inventory value, sales, purchases, customer and supplier debt, expenses, profit, low stock)", "Inventory cards are built on web and desktop. Sales, profit and debt cards wait on the sales module."],
      [P, "Charts (sales, purchases, expenses, top sellers, stock movement, debt, warehouse performance)", "Stock movement, stock value and stock health charts are built. Sales-based charts are not."],
    ],
  },
  {
    title: "Reports",
    phase: "MVP",
    items: [
      [P, "Inventory reports: current stock, valuation, movement, low/out of stock, adjustments", "Shown in the desktop Reports and Inventory screens, without date or user filters."],
      [N, "Sales reports (by period, product, customer, employee, warehouse)", "Needs the sales module."],
      [N, "Purchase reports (by supplier, product, warehouse)", ""],
      [N, "Financial reports: revenue, expenses, gross profit, debts, payments", ""],
      [N, "Filtering by date, warehouse, user, customer, supplier, product", "Excel/PDF export is planned for Phase 2."],
    ],
  },
  {
    title: "Notifications",
    phase: "Phase 2",
    items: [
      [P, "Low/out of stock, subscription expiring/expired, payment success/failure, customer payment, purchase received, transfer completed", "Stock, trial, subscription and payment emails are built. Customer payment, purchase received and transfer emails aren't."],
      [D, "Email notifications (MVP)", "Through Resend, with a daily job for reminders and renewals."],
      [N, "SMS, WhatsApp and push notifications", ""],
    ],
  },
  {
    title: "Subscription Management & Enforcement",
    phase: "MVP",
    items: [
      [D, "Plan, status, start/expiry, billing cycle, amount, payment history, renewal status", ""],
      [D, "Statuses: trial, active, past due, expired, suspended, cancelled", "14-day trial; locked organizations are refused by the API."],
      [D, "Enforced plan limits (users, warehouses, products) configurable from admin", ""],
    ],
  },
  {
    title: "Payment System",
    phase: "MVP",
    items: [
      [P, "Subscribe, renew, upgrade, downgrade, cancel", "Subscribe, automatic renewal and cancel are built. Upgrade/downgrade waits on a proration decision."],
      [D, "Payment verification, history and receipts", "Paystack in TEST mode: live keys and business verification are still needed."],
      [P, "Payment provider abstraction (swap or add Flutterwave later)", "Payments record their provider, but the logic is written directly against Paystack."],
    ],
  },
  {
    title: "Super Admin Dashboard",
    phase: "MVP",
    items: [
      [D, "Platform dashboard: organizations, subscriptions, MRR, new registrations, churn", "Overview plus an Insights page."],
      [D, "Organization management: view, search, suspend, reactivate, usage and activity", ""],
      [D, "Plan configuration: create, edit, disable, limits and pricing", ""],
      [D, "Payment history, support tickets and issue tracking", "Payments page and a support inbox with email replies."],
    ],
  },
  {
    title: "Audit Logs",
    phase: "MVP",
    items: [
      [D, "Every important operation logged with before/after values", ""],
      [D, "IP and device information", ""],
    ],
  },
  {
    title: "Offline Capability",
    phase: "Phase 2",
    items: [
      [D, "Local database with a sync queue", "Delivered early in the desktop app: products, stock, customers, suppliers and credit are queued offline and synced later."],
    ],
  },
  {
    title: "Mobile Application",
    phase: "Phase 2",
    items: [[N, "Android/iOS from the same Flutter codebase", ""]],
  },
  {
    title: "Advanced Platform Features",
    phase: "Phase 3",
    items: [
      [N, "Accounting and payroll integration", ""],
      [N, "Point of sale (POS)", ""],
      [N, "E-commerce integration and public API", "The v1 API is for the desktop app only."],
      [N, "Advanced BI, multi-currency/country, advanced tax", ""],
    ],
  },
];

const DIFFERENTIATORS = [
  [N, "WhatsApp-native workflows", "MVP / near-term", ""],
  [N, "Customer credit risk scoring", "MVP / near-term", "The customer and credit data it needs now exists."],
  [N, "Photo-evidence stock adjustments", "MVP / near-term", "Image storage is in place; stock movements don't take a photo yet."],
  [D, "Offline-first with sync", "Phase 2", "Built in the desktop app."],
  [N, "Landed-cost calculator for imports", "Phase 2", ""],
  [N, "Inter-business network (surplus marketplace, pooled purchasing)", "Phase 2", ""],
  [N, "Embedded inventory financing", "Phase 3", ""],
];

const NEXT_STEPS = [
  ["Sales module", "The biggest MVP gap: sales records and invoices that reduce stock, sync to the backend, and feed the dashboard and reports."],
  ["Move purchases and expenses to the backend", "Today they live on one computer. Add purchase statuses and make receiving increase stock."],
  ["Small gaps in built modules", "Product-supplier link, customer type, enforcing credit limits, and an inventory valuation report."],
  ["Plan upgrade/downgrade", "Decide on proration."],
  ["Go live with Paystack", "Live keys and business verification."],
];

const LABEL = { [D]: "Done", [P]: "Partial", [N]: "Not started" };
const ICON = { [D]: "&#10003;", [P]: "&#9680;", [N]: "&#10007;" };

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function tally(items) {
  const t = { [D]: 0, [P]: 0, [N]: 0 };
  for (const [s] of items) t[s]++;
  return t;
}

function bar(t) {
  const total = t[D] + t[P] + t[N] || 1;
  return `<div class="bar"><span class="b-done" style="width:${(t[D] / total) * 100}%"></span><span class="b-partial" style="width:${(t[P] / total) * 100}%"></span></div>`;
}

const pill = (s) => `<span class="pill ${s}"><span class="ic">${ICON[s]}</span>${LABEL[s]}</span>`;

const phases = ["MVP", "Phase 2", "Phase 3"];
const phaseRows = phases.map((ph) => {
  const items = MODULES.filter((m) => m.phase === ph).flatMap((m) => m.items);
  return [ph, tally(items)];
});
phaseRows.push(["Differentiators", tally(DIFFERENTIATORS)]);
const all = tally([...MODULES.flatMap((m) => m.items), ...DIFFERENTIATORS]);
const allTotal = all[D] + all[P] + all[N];
const mvpT = phaseRows[0][1];
const mvpTotal = mvpT[D] + mvpT[P] + mvpT[N];

const summaryTable = `
<table class="summary">
  <thead><tr><th>Phase</th><th class="num">Done</th><th class="num">Partial</th><th class="num">Not started</th><th class="num">Total</th><th class="barcol">Progress</th></tr></thead>
  <tbody>
    ${phaseRows.map(([ph, t]) => `<tr><td><b>${ph}</b></td><td class="num">${t[D]}</td><td class="num">${t[P]}</td><td class="num">${t[N]}</td><td class="num">${t[D] + t[P] + t[N]}</td><td class="barcol">${bar(t)}</td></tr>`).join("")}
    <tr class="total"><td><b>All items</b></td><td class="num">${all[D]}</td><td class="num">${all[P]}</td><td class="num">${all[N]}</td><td class="num">${allTotal}</td><td class="barcol">${bar(all)}</td></tr>
  </tbody>
</table>`;

const moduleOverview = `
<table class="overview">
  <thead><tr><th>Module</th><th>Phase</th><th class="num">Done</th><th class="num">Partial</th><th class="num">Not started</th><th class="barcol">Progress</th></tr></thead>
  <tbody>
    ${MODULES.map((m) => {
      const t = tally(m.items);
      return `<tr><td>${esc(m.title)}</td><td><span class="tag ${m.phase.replace(" ", "")}">${m.phase}</span></td><td class="num">${t[D]}</td><td class="num">${t[P]}</td><td class="num">${t[N]}</td><td class="barcol">${bar(t)}</td></tr>`;
    }).join("")}
  </tbody>
</table>`;

const checklist = MODULES.map(
  (m) => `
<section class="module">
  <h3>${esc(m.title)} <span class="tag ${m.phase.replace(" ", "")}">${m.phase}</span></h3>
  <table class="items">
    ${m.items.map(([s, item, note]) => `<tr class="${s}"><td class="st">${pill(s)}</td><td><div class="item">${esc(item)}</div>${note ? `<div class="note">${esc(note)}</div>` : ""}</td></tr>`).join("")}
  </table>
</section>`,
).join("");

const diffTable = `
<table class="items">
  ${DIFFERENTIATORS.map(([s, item, phase, note]) => `<tr class="${s}"><td class="st">${pill(s)}</td><td><div class="item">${esc(item)} <span class="tag small">${phase}</span></div>${note ? `<div class="note">${esc(note)}</div>` : ""}</td></tr>`).join("")}
</table>`;

const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Aimify Feature Checklist</title>
<style>
  @page { size: A4; margin: 16mm 15mm 16mm 15mm; }
  * { box-sizing: border-box; }
  body { font-family: "Segoe UI", Arial, sans-serif; color: #24292f; font-size: 10pt; line-height: 1.4; margin: 0; }
  h1 { font-size: 30pt; margin: 0; color: #1d2545; letter-spacing: 0.5px; }
  .subtitle { font-size: 15pt; color: #c9800c; font-weight: 600; margin: 2px 0 6px; }
  .meta { color: #6a737d; font-size: 9.5pt; margin-bottom: 14px; }
  h2 { font-size: 15pt; color: #1d2545; border-bottom: 2px solid #c9800c; padding-bottom: 4px; margin: 22px 0 10px; }
  h3 { font-size: 11.5pt; color: #1d2545; margin: 0 0 6px; }
  .callout { background: #faf3e3; border-left: 4px solid #c9800c; padding: 10px 14px; border-radius: 3px; margin: 10px 0 14px; }
  .legend { display: flex; gap: 14px; flex-wrap: wrap; margin: 8px 0 4px; font-size: 9pt; color: #57606a; align-items: center; }
  table { width: 100%; border-collapse: collapse; }
  thead th { background: #1d2545; color: #fff; text-align: left; font-weight: 600; padding: 6px 8px; font-size: 9pt; }
  td { padding: 6px 8px; vertical-align: top; border-bottom: 1px solid #e6e8eb; }
  .num { text-align: center; width: 62px; }
  .barcol { width: 150px; }
  tr.total td { border-top: 2px solid #1d2545; background: #f6f7f9; }
  .bar { height: 9px; background: #f1d1cf; border-radius: 5px; overflow: hidden; display: flex; margin-top: 4px; }
  .b-done { background: #2e9e5b; }
  .b-partial { background: #e0a526; }
  .overview td { padding: 4px 8px; font-size: 9pt; }
  .module { break-inside: avoid; margin: 0 0 14px; }
  .items td { padding: 5px 8px; }
  .items td.st { width: 108px; padding-left: 0; }
  .items tr.done td { background: #f3faf5; }
  .items tr.partial td { background: #fffaf0; }
  .items tr.todo td { background: #fdf5f5; }
  .item { font-weight: 600; }
  .note { color: #57606a; font-size: 9pt; margin-top: 1px; }
  .pill { display: inline-flex; align-items: center; gap: 5px; font-size: 8.5pt; font-weight: 700; padding: 2px 8px 2px 3px; border-radius: 10px; white-space: nowrap; }
  .pill .ic { display: inline-flex; width: 15px; height: 15px; border-radius: 50%; align-items: center; justify-content: center; color: #fff; font-size: 9pt; line-height: 1; }
  .pill.done { color: #1f7a45; background: #dcf2e4; } .pill.done .ic { background: #2e9e5b; }
  .pill.partial { color: #8a5a00; background: #fbecc8; } .pill.partial .ic { background: #e0a526; }
  .pill.todo { color: #a12d2d; background: #f8dcdc; } .pill.todo .ic { background: #c94040; }
  .tag { font-size: 7.5pt; font-weight: 700; padding: 1px 6px; border-radius: 3px; vertical-align: middle; letter-spacing: 0.4px; text-transform: uppercase; }
  .tag.MVP { background: #dcf2e4; color: #1f7a45; }
  .tag.Phase2 { background: #fde9cf; color: #a35a00; }
  .tag.Phase3 { background: #e6e8ee; color: #4b5470; }
  .tag.small { background: #eef0f4; color: #57606a; font-weight: 600; }
  ol.next { padding-left: 18px; margin: 6px 0; } ol.next li { margin-bottom: 5px; }
  .lg { white-space: nowrap; display: inline-flex; align-items: center; gap: 6px; }
  .keep { break-inside: avoid; }
  .foot { color: #8c959f; font-size: 8.5pt; margin-top: 18px; }
</style></head>
<body>
  <h1>AIMIFY</h1>
  <div class="subtitle">Feature Checklist</div>
  <div class="meta">Every item in the Full Proposed Feature Set (August 2026), ticked against what is built. Status as of ${AS_OF}, checked against the aimify-web and aimify_desktop repositories.</div>

  <div class="callout"><b>Where things stand.</b> ${all[D]} of ${allTotal} proposed items are done and ${all[P]} are partly done. For the MVP, ${mvpT[D]} of ${mvpTotal} items are done and ${mvpT[P]} partly done. The account, subscription, payments, admin, inventory, customer, supplier and credit foundations are in place. The main MVP gap is <b>sales</b>, which doesn't exist yet. Sales also holds up the sales-based dashboard cards and the sales and financial reports. Purchases and expenses work in the desktop app but are saved only on that computer. Offline sync and two-factor sign-in were delivered ahead of plan.</div>

  <div class="legend"><span class="lg">${pill(D)} built and tested</span><span class="lg">${pill(P)} incomplete, or saved on one computer only</span><span class="lg">${pill(N)} nothing built yet</span></div>

  <h2>Summary by phase</h2>
  ${summaryTable}

  <h2>Progress by module</h2>
  ${moduleOverview}

  <h2>Part 1 — Core platform modules</h2>
  ${checklist}

  <h2>Part 2 — Differentiator features</h2>
  ${diffTable}

  <div class="keep"><h2>Suggested next steps</h2>
  <ol class="next">${NEXT_STEPS.map(([t, d]) => `<li><b>${esc(t)}.</b> ${esc(d)}</li>`).join("")}</ol></div>

  <div class="foot">Generated by scripts/generate-feature-checklist.mjs. Edit the statuses in that file and run <i>node scripts/generate-feature-checklist.mjs</i> to rebuild this PDF.</div>
</body></html>`;

const BROWSERS = [
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
];
const browser = BROWSERS.find((b) => existsSync(b));
if (!browser) {
  console.error("No Edge or Chrome found to print the PDF.");
  process.exit(1);
}

const dir = mkdtempSync(path.join(tmpdir(), "aimify-checklist-"));
const htmlPath = path.join(dir, "checklist.html");
writeFileSync(htmlPath, html);

execFileSync(browser, [
  "--headless",
  "--disable-gpu",
  "--no-pdf-header-footer",
  `--user-data-dir=${path.join(dir, "profile")}`,
  `--print-to-pdf=${OUT}`,
  pathToFileURL(htmlPath).href,
], { stdio: "ignore" });

console.log(`Wrote ${OUT}`);
console.log(`All: ${all[D]} done, ${all[P]} partial, ${all[N]} not started (of ${allTotal})`);
console.log(`MVP: ${mvpT[D]} done, ${mvpT[P]} partial, ${mvpT[N]} not started (of ${mvpTotal})`);
