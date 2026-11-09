// Builds docs/aimify-guide.pdf: Aimify explained step by step in plain
// language, for people who aren't technical. Edit the text below and run
//   node scripts/generate-user-guide.mjs
// (needs Microsoft Edge or Google Chrome installed to print the PDF).
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const AS_OF = "4 November 2026";
const OUT = path.resolve("docs/aimify-guide.pdf");

// Small helpers for the page.
const note = (title, body, kind = "") => `<div class="box ${kind}"><p class="box-title">${title}</p>${body}</div>`;
const steps = (items) => `<ol class="steps">${items.map((s) => `<li>${s}</li>`).join("")}</ol>`;
const list = (items) => `<ul>${items.map((s) => `<li>${s}</li>`).join("")}</ul>`;
const table = (headers, rows) =>
  `<table><thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows
    .map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`)
    .join("")}</tbody></table>`;

const chapters = [];
const chapter = (title, body) => chapters.push({ title, body });

// ---------------------------------------------------------------- 1
chapter(
  "What Aimify is",
  `
<p>Aimify is a computer program for running a trading business: a wholesaler, distributor, shop or warehouse. It keeps track of:</p>
${list([
  "<b>What you have</b>: every product, how many are in each store or warehouse, and what they are worth.",
  "<b>What you buy</b>: orders to your suppliers, what has arrived, and what you still owe them.",
  "<b>What you sell</b>: every sale, who bought it, what they paid and what they still owe you.",
  "<b>What you spend</b>: rent, salaries, fuel and every other running cost.",
  "<b>How the business is doing</b>: sales, profit, debts and stock, shown on a dashboard and in reports you can print.",
])}
<p>Think of it as replacing the exercise books, receipt pads and spreadsheets that many businesses use. Everything is written down once, in one place, and the totals add themselves up.</p>
${note(
  "In simple terms",
  "<p>When you sell 3 bags of rice, you record the sale once. Aimify then takes the 3 bags out of your stock, adds the money to your sales, notes how much the customer still owes, works out your profit, and lets you print the invoice. You don't write the same thing in four places.</p>",
)}
<h3>Who it is for</h3>
<p>Aimify is built for businesses in Nigeria (prices are in Naira, and payments use Paystack), but nothing stops any trading business using it. One business is called an <b>organization</b> in Aimify. Several people from the same business can use it at once, each with their own login.</p>
`,
);

// ---------------------------------------------------------------- 2
chapter(
  "The two parts of Aimify, and how they connect",
  `
<p>Aimify has two parts that you use, and one part that works quietly in the background.</p>
<div class="diagram">
  <div class="node"><b>The website</b><span>Sign up, pay, manage your team and settings, see a summary</span></div>
  <div class="arrow">⇄</div>
  <div class="node strong"><b>Aimify's online system</b><span>Keeps every business's records safely, works out totals, sends emails</span></div>
  <div class="arrow">⇄</div>
  <div class="node"><b>The desktop app</b><span>The everyday work: products, stock, sales, purchases, reports</span></div>
</div>
<h3>1. The website</h3>
<p>You visit it in a web browser (Chrome, Edge and so on). It is where you <b>create your account</b>, <b>pay for your subscription</b>, <b>invite your staff</b>, decide <b>what each role is allowed to do</b>, and update your <b>company details</b>. It also shows a short summary of how the month is going.</p>
<h3>2. The desktop app</h3>
<p>A program you install on a Windows computer (downloaded from the website). This is where the daily work happens: adding products, receiving goods, selling, recording payments and expenses, and looking at the dashboard and reports. You can install it on as many computers as you need, for example one at the shop counter and one in the office.</p>
<h3>3. Aimify's online system (behind the scenes)</h3>
<p>Both the website and the desktop app talk to the same online system. You can picture it as a very safe filing cabinet in the cloud, with a careful clerk in front of it. Whenever someone records something, the clerk checks they are allowed to, files it, and updates every total. That is why a sale made at the shop shows up immediately on the owner's computer at home.</p>
${note(
  "Your business's records are kept apart",
  "<p>Many businesses use Aimify, but each one only ever sees its own records. Every record is labelled with the business it belongs to, and every request is checked against that label.</p>",
)}
`,
);

// ---------------------------------------------------------------- 3
chapter(
  "Getting started, step by step",
  `
<h3>On the website</h3>
${steps([
  "<b>Sign up</b> with your name, email address and a password.",
  "<b>Confirm your email.</b> Aimify sends a link to your inbox; click it (it works for 24 hours, and you can ask for a new one).",
  "<b>Set up your business</b>: its name, industry and your first warehouse or store.",
  "Your <b>14-day free trial</b> starts. Everything works during the trial; you don't need to pay yet.",
  "<b>Download the desktop app</b> from the Download page and install it.",
])}
<h3>In the desktop app</h3>
${steps([
  "<b>Sign in</b> with the same email and password.",
  "The <b>guided setup</b> opens for the Owner and Administrators and walks through: company and warehouse details, adding your products (one by one or from an Excel sheet), entering the stock you already have (opening stock), inviting your staff, and your subscription.",
  "When the setup is finished you land on the <b>dashboard</b>, and you're ready to work.",
])}
${note(
  "Tip",
  "<p>If you already keep your products in Excel, use the import option instead of typing them in. Aimify reads the sheet, shows you what it found (and any problems) before saving, and can match each product's usual supplier by name.</p>",
)}
`,
);

// ---------------------------------------------------------------- 4
chapter(
  "People, roles and what they can do",
  `
<p>Everyone who uses Aimify has their own login. The Owner (or an Administrator) <b>invites</b> people by email from the website's <b>Team</b> page and gives each person a <b>role</b>. The role decides what they can see and do, so a sales attendant can sell without being able to see your profit or delete your products.</p>
<h3>The six roles (as set up at the start)</h3>
${table(
  ["Role", "In plain words", "Can do, by default"],
  [
    ["Owner", "The boss. There is one per business.", "Everything, including paying, changing the plan, changing permissions and cancelling the subscription."],
    ["Administrator", "The owner's right hand.", "Almost everything: team, products, stock, sales, purchases, expenses, discounts and voids. Cannot change the plan or cancel."],
    ["Warehouse Manager", "Runs the store or warehouse.", "Products, all stock movements, warehouses, suppliers, purchases and receiving goods, recording expenses."],
    ["Inventory Staff", "Handles the goods.", "Adds and edits products, records stock in, out, adjustments and counts."],
    ["Sales Staff", "Sells to customers.", "Records sales and customers, takes stock out. Cannot give discounts or void sales unless allowed."],
    ["Accountant / Finance", "Looks after the money.", "Sees sales, purchases, customers and suppliers, records payments and expenses, sees the profit reports."],
  ],
)}
<h3>Changing what a role can do</h3>
<p>The Owner can change these on the website: <b>Team</b>, then <b>Roles &amp; permissions</b>. Each area (products, stock, sales, and so on) has tick boxes for <i>view</i>, <i>add</i>, <i>edit</i> and <i>remove</i>. Changes apply to everyone with that role, are recorded in the activity log, and can be reset to the defaults at any time.</p>
${note(
  "What people see follows their role",
  "<p>In the desktop app, screens and buttons a person isn't allowed to use simply don't appear. And even if someone tried to get round that, Aimify's online system checks the role again before saving anything.</p>",
)}
`,
);

// ---------------------------------------------------------------- 5
chapter(
  "Products",
  `
<p>A <b>product</b> is anything you buy and sell: a bag of rice, a carton of milk, a keg of oil. Each product has:</p>
${list([
  "A <b>name</b> and a <b>SKU</b> (your own short code for it, for example RICE-50) and, if it has one, a <b>barcode</b>.",
  "A <b>category</b> (Grains, Oils...) and a <b>unit</b> (bag, carton, keg...). You can add your own categories and units.",
  "Its <b>purchase price</b> (what it costs you) and <b>selling price</b> (what you charge).",
  "A <b>minimum stock level</b>: when stock falls to this number, Aimify warns you that it's running low.",
  "An optional picture, description, brand and <b>usual supplier</b>.",
])}
<h3>How to add products</h3>
${steps([
  "Open <b>Products</b> in the desktop app.",
  "Click <b>Add product</b> and fill in the form, or click <b>Import</b> to bring many in from an Excel sheet.",
  "Save. The product now appears everywhere: in stock, sales, purchases and reports.",
])}
<h3>Products you no longer sell</h3>
<p>You don't delete them; you <b>archive</b> them. An archived product disappears from everyday lists but its history (old sales, old purchases) is kept, and you can restore it later.</p>
`,
);

// ---------------------------------------------------------------- 6
chapter(
  "Stock and warehouses",
  `
<p>Aimify always knows how many of each product you have, <b>in each warehouse</b>. A <b>warehouse</b> is any place you keep goods: a store, a shop, a depot.</p>
<h3>How stock changes</h3>
<p>Stock never changes silently. Every change is a <b>stock movement</b>, and each one records what changed, how many, in which warehouse, who did it, when, and why. There are four kinds:</p>
${table(
  ["Movement", "When you use it", "Example"],
  [
    ["Stock in", "Goods arrive that weren't bought through a purchase order.", "20 bags found in the back store, put on the system."],
    ["Stock out", "Goods leave for a reason other than a sale.", "5 cartons taken for the owner's use."],
    ["Adjustment", "A correction up or down, with a reason.", "2 bags damaged in the rain."],
    ["Stock count", "You count what is really on the shelf and enter that number; Aimify records the difference.", "System says 50, you count 48: a count records -2."],
  ],
)}
<p>Sales and purchases move stock <b>automatically</b>: a sale takes goods out of its warehouse, and receiving a purchase puts them in. You don't record those by hand.</p>
<h3>Safety rules</h3>
${list([
  "You can't take out more than a warehouse holds. Even if two people sell the last bag at the same moment, only one sale goes through.",
  "A warehouse can only be switched off (disabled) when it is empty.",
  "Your plan decides how many warehouses can be active at once (see chapter 17).",
])}
<h3>Running low</h3>
<p>When a product falls to its minimum level, or runs out completely, Aimify shows it on the dashboard and in the Inventory screen, and emails the business so someone can reorder.</p>
`,
);

// ---------------------------------------------------------------- 7
chapter(
  "Buying from suppliers (purchases)",
  `
<p>A <b>purchase</b> is an order you place with a supplier. Each one gets a number like <b>PO-0001</b>.</p>
<h3>The life of a purchase</h3>
${table(
  ["Status", "Meaning"],
  [
    ["Draft", "Still being prepared. Nothing has happened yet."],
    ["Ordered (pending)", "Sent to the supplier; waiting for the goods."],
    ["Partly received", "Some of the goods have arrived."],
    ["Received", "Everything has arrived."],
    ["Cancelled", "Called off. If you had already paid, Aimify notes that the supplier owes you that money back."],
  ],
)}
<h3>How to buy and receive goods</h3>
${steps([
  "Open <b>Purchases</b> and click <b>New purchase</b>.",
  "Choose the supplier and the warehouse the goods are going to, then add the products, quantities and the price you're paying.",
  "Save it as a draft, or as ordered. You can print a <b>purchase order</b> to send to the supplier.",
  "When the goods arrive, click <b>Receive</b>. Enter what actually came; you can receive part now and the rest later.",
  "Aimify adds the goods to that warehouse's stock, updates each product's purchase price, and adds what you owe to the supplier's account. You can print a <b>goods received note</b>.",
  "When you pay the supplier, click <b>Pay</b> and enter the amount. You can print a payment receipt.",
])}
`,
);

// ---------------------------------------------------------------- 8
chapter(
  "Selling (sales)",
  `
<p>Every sale gets an invoice number like <b>INV-0001</b>.</p>
<h3>How to make a sale</h3>
${steps([
  "Open <b>Sales</b> and click <b>New sale</b>.",
  "Choose the customer, or leave it as a <b>walk-in</b> customer for someone you don't need to keep a record of.",
  "Choose the warehouse the goods are coming from, and add the products and quantities. Prices fill in automatically.",
  "Enter how much the customer is paying now, and how (cash, bank transfer, POS, card, cheque).",
  "Save. Aimify takes the goods out of that warehouse, records the payment, and if the customer hasn't paid in full, adds the rest to their account. Print the <b>invoice</b> or a <b>receipt</b>.",
])}
<h3>Rules that protect the business</h3>
${list([
  "A <b>walk-in</b> customer must pay in full. Only a named customer can buy on credit.",
  "Each customer has a <b>credit limit</b>. A sale that would take them over it is blocked, unless an Owner or Administrator allows it; that approval is recorded.",
  "Changing a price or giving a <b>discount</b> needs permission (Owner and Administrator by default).",
  "A sale recorded by mistake isn't deleted; an Owner or Administrator <b>voids</b> it with a reason. The goods go back into stock, and the customer's account is corrected. If they had paid, that money becomes credit on their account or is shown as owed back to them.",
  "Tax (for example VAT) is added automatically if your business has set a tax rate.",
])}
`,
);

// ---------------------------------------------------------------- 9
chapter(
  "Customers and suppliers",
  `
<h3>Customers</h3>
<p>Each customer has a name, phone, email, address, a <b>customer type</b> and a <b>credit limit</b>. Customer types (for example Retail, Wholesale, Distributor) are set by the Owner, and each type has a default credit limit and payment terms that new customers of that type get automatically.</p>
<p>Every customer has their own <b>page</b> showing everything they have bought, every payment, what they owe now and what is overdue. You can print a <b>statement</b> of their account to give them.</p>
<h3>Suppliers</h3>
<p>Each supplier has their details, a contact person and payment terms. Their page shows what you owe them and what is overdue, everything you have bought from them, the products they supply and <b>how their prices have changed</b> over time. Aimify can also suggest a <b>reorder</b>: products from that supplier that are running low, ready to turn into a purchase order in one click.</p>
<h3>Bringing your list in and out</h3>
<p>Both customers and suppliers can be <b>imported from Excel</b> (including what they already owe you or you owe them on the day you start) and <b>exported to Excel</b>. Customers and suppliers you no longer deal with are archived, not deleted.</p>
`,
);

// ---------------------------------------------------------------- 10
chapter(
  "Credit, debts and payments",
  `
<p>Aimify keeps an <b>account</b> for every customer and supplier, like a page in a ledger book. Everything that raises or lowers what they owe is written on it.</p>
<h3>How a customer account works</h3>
${list([
  "A credit sale adds to what the customer owes. It is <b>due</b> after their payment terms (for example 30 days).",
  "When they pay on their account, Aimify gives them a numbered receipt (<b>RCPT-0001</b>) and uses the money to settle their <b>oldest unpaid invoices first</b>. The receipt shows which invoices it paid off.",
  "Anything past its due date is <b>overdue</b>.",
])}
<h3>Seeing who owes what</h3>
<p>The <b>Credits &amp; Debts</b> screen has:</p>
${list([
  "<b>Aging report</b>: everyone who owes you (or whom you owe), split by how late: not yet due, 1 to 30 days, 31 to 60, 61 to 90, and over 90 days. Print it or save it to Excel.",
  "<b>Who to chase</b>: the customers to call first, with how much and how late.",
  "Each person's full history and statement.",
])}
${note(
  "Example",
  "<p>Ada Stores buys goods worth ₦385,000 on 5 October with 30-day terms and pays nothing. On 4 November the invoice is due. On 20 November she pays ₦150,000: Aimify issues a receipt, puts the ₦150,000 against that invoice, and she still owes ₦235,000, which is now overdue.</p>",
)}
`,
);

// ---------------------------------------------------------------- 11
chapter(
  "Expenses (running costs)",
  `
<p>An <b>expense</b> is money the business spends that isn't buying goods to sell: rent, salaries, electricity, fuel for the generator, transport, bank charges. Each expense gets a number like <b>EXP-0001</b>.</p>
<h3>How to record an expense</h3>
${steps([
  "Open <b>Expenses</b> and click <b>Add expense</b>.",
  "Choose the category (Rent, Fuel...), the amount, the date, how it was paid, and optionally the warehouse it was for and who was paid.",
  "Attach a <b>photo or PDF of the receipt</b> if you have one.",
  "Save.",
])}
<h3>Helpful extras</h3>
${list([
  "<b>Monthly budgets</b>: the Owner can set a budget per category (for example ₦50,000 a month for fuel) and see how much is left.",
  "<b>Recurring expenses</b>: rent, salaries and other regular costs are set up once. When one is due, Aimify reminds you and you record it with one click (it can't be recorded twice by accident).",
  "<b>Mistakes</b> aren't deleted: an expense is edited (Aimify remembers who changed it and when) or voided with a reason.",
  "The <b>expense report</b> shows spending by category against the budget, by month and by warehouse, ready to print or save to Excel.",
])}
`,
);

// ---------------------------------------------------------------- 12
chapter(
  "The dashboard",
  `
<p>The dashboard is the first thing you see in the desktop app: the business at a glance.</p>
<h3>Choose a period</h3>
<p>Pick <b>Today</b>, <b>This week</b>, <b>This month</b>, <b>Last month</b> or <b>This year</b>. Every figure is compared with the period before (for example "▲ 40% vs last month"), so you can see at once whether things are getting better or worse.</p>
<h3>The cards</h3>
${list([
  "<b>Sales</b>: what you sold, and how many sales.",
  "<b>Gross profit</b> and its <b>margin</b>: what you made on the goods (see chapter 13).",
  "<b>Net profit</b>: what is left after expenses too. Shown in red if it's a loss.",
  "<b>Expenses</b> and <b>Purchases</b>.",
  "<b>Customers owe you</b> and <b>You owe suppliers</b>, each with the overdue part.",
])}
<h3>The charts</h3>
${list([
  "<b>Sales trend</b>: sales and gross profit day by day (or month by month for the year).",
  "<b>Money in vs out</b>: sales against purchases and expenses.",
  "<b>Top sellers</b>: your best products and customers.",
  "<b>Debt &amp; warehouses</b>: what is owed both ways, and each warehouse's sales and stock value.",
])}
<p>Below that is the <b>inventory snapshot</b>: stock value, items running low, and recent stock activity. Each person only sees the parts their role allows; a sales attendant, for example, doesn't see expenses or net profit. The website also shows a short "this month so far" summary.</p>
`,
);

// ---------------------------------------------------------------- 13
chapter(
  "Reports, and how profit is worked out",
  `
<p>The <b>Reports</b> screen has these reports. Each one can cover any period (this month, last month, this quarter, this year, the last 12 months, or any dates you choose), can be narrowed down with filters, and can be <b>printed or saved as a PDF</b> or <b>saved to Excel</b>.</p>
${table(
  ["Report", "What it tells you", "You can narrow it by"],
  [
    ["Overview", "Stock value, stock health and stock activity charts.", "-"],
    ["Valuation", "What all your stock is worth, at cost and at selling price.", "Warehouse, category"],
    ["Sales", "Sales by day or month, product, customer, staff member and warehouse; every sale.", "Warehouse, customer (or walk-ins), staff member, product"],
    ["Purchases", "What you ordered and received, paid and still owe, by supplier, product and warehouse; average, lowest and highest prices paid.", "Supplier, warehouse, product"],
    ["Profit &amp; loss", "The profit statement, and the money that actually came in and went out.", "Warehouse"],
    ["Stock history", "Every stock movement: what, how many, who, and the sale or purchase behind it.", "Warehouse, product, type, where it came from, person"],
  ],
)}
<h3>How profit is worked out</h3>
${note(
  "Worked example: one month",
  `<p>You bought rice at ₦60,000 a bag. This month you sold 3 bags at ₦70,000 each and paid ₦25,000 rent.</p>
  ${table(
    ["Line", "Amount", "What it means"],
    [
      ["Sales (net sales)", "₦210,000", "3 bags × ₦70,000, after any discounts, before tax."],
      ["Less cost of the goods sold", "− ₦180,000", "What those 3 bags cost you: 3 × ₦60,000."],
      ["<b>Gross profit</b>", "<b>₦30,000</b>", "What you made on the goods themselves."],
      ["Less expenses", "− ₦25,000", "Rent, salaries, fuel and other running costs."],
      ["<b>Net profit</b>", "<b>₦5,000</b>", "What the business really made this month."],
    ],
  )}
  <p><b>Margin</b> is gross profit as a share of sales: ₦30,000 ÷ ₦210,000 = 14.3%. In other words, about ₦14 of every ₦100 of sales is profit on the goods.</p>`,
  "example",
)}
${list([
  "<b>Tax</b> you collect (for example VAT) is shown separately. It isn't your income; it belongs to the government.",
  "Each sale remembers what the goods cost <i>at the time</i>, so a later price rise doesn't change last month's profit.",
  "Voided sales and expenses are not counted.",
])}
<h3>Profit is not the same as cash</h3>
<p>The profit &amp; loss report also shows <b>money in and money out</b>: the payments that really happened. A credit sale counts as a sale (and profit) on the day you make it, but the money only comes in when the customer pays. Money in = what customers paid; money out = what you paid suppliers plus expenses. Watching both tells you whether the business is profitable <i>and</i> whether it has cash.</p>
`,
);

// ---------------------------------------------------------------- 14
chapter(
  "Printing and documents",
  `
<p>Aimify prints proper business documents with your company name, address, logo and tax details at the top. Each one opens in a preview where you can <b>print</b> it or <b>save it as a PDF</b> (to email or WhatsApp to someone).</p>
${table(
  ["Document", "Where"],
  [
    ["Invoice and sales receipt", "On each sale"],
    ["Payment receipt (RCPT-...)", "When a customer pays on their account"],
    ["Customer statement", "On each customer"],
    ["Purchase order, goods received note, payment receipt", "On each purchase"],
    ["Supplier statement", "On each supplier"],
    ["Aging report", "Credits &amp; Debts"],
    ["Expense report", "Expenses"],
    ["Sales, purchase, profit &amp; loss and stock history reports", "Reports"],
  ],
)}
<p>Many screens also <b>save to Excel</b> (reports, customer and supplier lists), so your accountant can work with the figures.</p>
`,
);

// ---------------------------------------------------------------- 15
chapter(
  "Working without internet",
  `
<p>Internet connections drop. The desktop app is built for that.</p>
${list([
  "The app keeps a copy of your recent records on the computer, so you can still look things up while offline.",
  "Most everyday work can still be recorded offline: sales, purchases, expenses, stock movements, customers, suppliers and payments. The app puts each one in a <b>waiting list</b> (a sync queue) and shows that it hasn't been sent yet.",
  "As soon as the connection is back, the app sends the waiting list to Aimify's online system in order.",
  "Each waiting item has its own tag, so if the connection drops halfway and the app sends it again, it is <b>never recorded twice</b>.",
  "If something can't be saved when it is finally sent (for example, the stock it needed was sold from another computer in the meantime), the app tells you, so it can be sorted out.",
])}
${note(
  "In simple terms",
  "<p>It's like writing in a notebook while the office is closed, then handing the notebook to the clerk when it opens. The clerk files each page once, and tells you about any page that can't be filed.</p>",
)}
`,
);

// ---------------------------------------------------------------- 16
chapter(
  "Keeping things safe and honest",
  `
${list([
  "<b>Passwords and logins</b>: Too many wrong passwords in a row and Aimify pauses login attempts for a while, to stop people guessing. A forgotten password is reset through a link sent by email that works once, for one hour.",
  "<b>Email confirmation</b>: each person confirms their email address before using the business's records.",
  "<b>Two-step login (optional)</b>: each person can turn on a second check: a 6-digit code from an authenticator app on their phone, with 10 backup codes in case the phone is lost.",
  "<b>Signed-in devices</b>: each person can see every computer or browser signed in to their account and sign any of them (or all of them) out.",
  "<b>Nothing disappears quietly</b>: products and people are archived, sales and expenses are voided with a reason. History is kept.",
  "<b>Activity log</b>: every important action is recorded: who did it, when, from which device, and what it was before and after. The Owner can look through it on the website's Activity page.",
  "<b>Permissions are checked twice</b>: the app hides what a person can't do, and the online system checks again before saving.",
])}
`,
);

// ---------------------------------------------------------------- 17
chapter(
  "Subscription, plans and payment",
  `
<h3>The free trial and after</h3>
<p>Every new business gets a <b>14-day free trial</b> with everything working. To keep using Aimify after that, the Owner or an Administrator subscribes on the website's <b>Billing</b> page and pays through <b>Paystack</b> by card, bank transfer or USSD. Card payments can be saved so the subscription <b>renews automatically</b> each month.</p>
<h3>What each status means</h3>
${table(
  ["Status", "What it means for you"],
  [
    ["Trial", "Free trial running. Everything works."],
    ["Active", "Paid up. Everything works until the renewal date."],
    ["Past due", "A renewal payment didn't go through. You get a few days' grace (3 days) to pay, and everything keeps working meanwhile."],
    ["Expired", "The trial ended or the payment wasn't made. The app is locked until you pay; your records are kept safely."],
    ["Cancelled", "The Owner cancelled and the period already paid for has ended. The app is locked until you subscribe again; your records are kept safely."],
    ["Suspended", "Paused by the Aimify team (for example, on request). Contact Aimify support."],
  ],
)}
<p>Cancelling never cuts you off early: after the Owner cancels, the status stays <b>Active</b> and everything works until the end of the period already paid for. Until then the Owner can undo it with <b>Keep my subscription</b>.</p>
<h3>Plans and limits</h3>
<p>A <b>plan</b> sets the monthly price and may limit how many <b>team members</b>, <b>active warehouses</b> and <b>active products</b> you can have. When you reach a limit, Aimify tells you; archiving a product or disabling an empty warehouse frees a place.</p>
<h3>Changing plan (Owner only)</h3>
${table(
  ["You choose", "What happens"],
  [
    ["Any plan, while on a trial or not currently paying", "It starts right away. The new price applies when you next pay."],
    ["A <b>dearer</b> plan, while paying", "It starts right away. You pay only the difference for the days left in the month (on the saved card, or on Paystack's page). Your renewal date doesn't change."],
    ["A <b>cheaper</b> plan, while paying", "You keep your current plan until the month you've paid for ends; then the cheaper plan starts. No refunds. You can change your mind before then."],
    ["A plan whose limits you are already over", "Aimify warns you first. Nothing is deleted; you just can't add more until you're under the limit."],
  ],
)}
${note(
  "Example",
  "<p>You pay ₦20,000 a month and move up to a ₦40,000 plan with 15 of the month's 31 days left. You pay about ₦9,700 now (the ₦20,000 difference for those 15 days), and from your next renewal date you pay ₦40,000 a month.</p>",
  "example",
)}
<h3>Emails Aimify sends</h3>
${list([
  "Trial ending soon, and trial ended.",
  "Renewal coming up, payment received (a receipt), payment failed, and subscription ended.",
  "Products running low or out of stock.",
  "Invitations to join a team, email confirmation and password reset links.",
])}
`,
);

// ---------------------------------------------------------------- 18
chapter(
  "Help, and the Aimify team's side",
  `
<h3>Getting help</h3>
<p>The website has a <b>Support</b> page where you can send a message to the Aimify team. Replies come by email.</p>
<h3>What the Aimify team can see and do</h3>
<p>The people who run Aimify have their own <b>admin panel</b>, separate from any business. From it they:</p>
${list([
  "See an overview of the platform: how many businesses use it, new sign-ups, trials, paying subscribers and monthly income.",
  "Look up a business, see its plan and usage, and suspend or reactivate it.",
  "Create the <b>plans</b>, set their prices and limits, and switch plans on or off.",
  "See all subscription payments.",
  "Answer support messages.",
])}
`,
);

// ---------------------------------------------------------------- 19
chapter(
  "What is ready, and what is coming",
  `
<p>Everything described in this guide is built and working. A few things are still being prepared or are planned for later:</p>
${table(
  ["Coming", "In plain words"],
  [
    ["Live payments", "Paystack is currently set up in test mode. Switching to real payments needs Aimify's live Paystack keys and business verification."],
    ["Plan lineup", "Today there is one plan, Full Access. Once the Aimify team adds more plans, customers can change plan by themselves."],
    ["Other payment providers", "Aimify is now built so another payment company (such as Flutterwave) can be added alongside Paystack, and the Aimify team can choose which one takes new payments. Adding a second company is the next step once its account is set up."],
    ["Returns", "Recording goods a customer brings back, or goods you send back to a supplier."],
    ["Stock transfers", "Moving goods from one warehouse to another in one step (today it is a stock out from one and a stock in to the other)."],
    ["SMS and WhatsApp", "Low-stock alerts and repayment reminders by SMS and WhatsApp, not just email."],
    ["Phone number check", "Confirming the Owner's phone number when they sign up."],
    ["Mobile app", "Aimify on Android and iPhone."],
  ],
)}
`,
);

// ---------------------------------------------------------------- 20
chapter(
  "Words you will see",
  table(
    ["Word", "Meaning"],
    [
      ["Organization", "Your business, as Aimify knows it."],
      ["Owner", "The person in charge of the business's Aimify account."],
      ["Role / permission", "A role is a job title (Sales Staff...). Permissions are the things that role is allowed to do."],
      ["SKU", "Your own short code for a product, for example RICE-50."],
      ["Warehouse", "Any place you keep stock: a store, shop or depot."],
      ["Stock movement", "Any change to how many of a product you have, with who, when and why."],
      ["Stock count", "Counting what is really on the shelf and correcting the system to match."],
      ["Purchase / PO", "An order to a supplier (PO = purchase order)."],
      ["Goods received note", "A document confirming what arrived from the supplier."],
      ["Invoice", "The bill for a sale (INV-...)."],
      ["Walk-in customer", "A one-off customer you don't keep a record of. They pay in full."],
      ["Credit sale", "A sale where the customer pays later."],
      ["Credit limit", "The most a customer is allowed to owe."],
      ["Payment terms / due date", "How many days a customer (or you) has to pay, and the date that falls on."],
      ["Overdue", "Owed and past its due date."],
      ["Aging report", "A list of debts grouped by how late they are."],
      ["Statement", "A printed summary of a customer's or supplier's account."],
      ["Void", "Cancelling a sale or expense recorded by mistake, with a reason, without deleting it."],
      ["Archive", "Putting a product, customer or supplier away without deleting its history."],
      ["Cost of goods sold", "What the goods you sold cost you to buy."],
      ["Gross profit", "Sales minus the cost of the goods sold."],
      ["Net profit", "Gross profit minus expenses: what the business really made."],
      ["Margin", "Gross profit as a percentage of sales."],
      ["Valuation", "What your stock is worth."],
      ["Sync", "The desktop app sending what it recorded offline once it's back online."],
      ["Subscription / plan", "What you pay monthly to use Aimify, and what that includes."],
      ["Paystack", "The Nigerian payment company Aimify uses to take subscription payments."],
    ],
  ),
);

// ---------------------------------------------------------------- 21
chapter(
  "Common questions",
  `
<dl class="faq">
<dt>Do I need the internet to use Aimify?</dt>
<dd>To sign up, pay and use the website, yes. The desktop app keeps working when the connection drops and sends everything once it's back.</dd>
<dt>Can my staff see my profit?</dt>
<dd>Only if their role allows it. By default, Sales Staff and Inventory Staff don't see expenses or profit. The Owner can change this.</dd>
<dt>What happens if someone records something by mistake?</dt>
<dd>Sales and expenses are voided with a reason, products are archived, and stock is corrected with an adjustment. Nothing is silently deleted, and the activity log shows who did what.</dd>
<dt>Can two people sell the last item at the same time?</dt>
<dd>No. Aimify checks stock at the moment each sale is saved; only one of them goes through.</dd>
<dt>What happens to my records if I stop paying?</dt>
<dd>The app is locked, but your records are kept. When you pay again, everything is there as you left it.</dd>
<dt>Can I use more than one computer?</dt>
<dd>Yes. Install the desktop app on as many Windows computers as you need; everyone sees the same records.</dd>
<dt>Can I get my records out?</dt>
<dd>Yes. Reports, customer and supplier lists save to Excel, and every document and report prints or saves as a PDF.</dd>
<dt>Who do I contact for help?</dt>
<dd>Use the Support page on the website, or email support@aimify.app.</dd>
</dl>
`,
);

const contents = chapters.map((c, i) => `<li><span>${i + 1}.</span> ${c.title}</li>`).join("");
const body = chapters
  .map((c, i) => `<section class="chapter" id="ch${i + 1}"><p class="eyebrow">Chapter ${i + 1}</p><h2>${c.title}</h2>${c.body}</section>`)
  .join("");

const html = `<!doctype html><html><head><meta charset="utf-8"><title>Aimify, explained</title>
<style>
  @page { size: A4; margin: 18mm 18mm 18mm 18mm; }
  * { box-sizing: border-box; }
  body { font-family: "Segoe UI", Arial, sans-serif; color: #242424; font-size: 10.6pt; line-height: 1.55; margin: 0; }
  h1, h2, h3 { font-family: Georgia, "Times New Roman", serif; color: #1d2545; }
  h2 { font-size: 20pt; margin: 2px 0 12px; }
  h3 { font-size: 12.5pt; margin: 18px 0 6px; }
  p { margin: 0 0 9px; }
  ul, ol { margin: 0 0 10px; padding-left: 20px; }
  li { margin-bottom: 4px; }
  b { color: #1d2545; }
  .cover { height: 255mm; display: flex; flex-direction: column; justify-content: center; page-break-after: always; }
  .cover .brand { font-family: Georgia, serif; font-size: 44pt; color: #1d2545; margin: 0; }
  .cover .brand span { color: #c9800c; font-style: italic; }
  .cover h1 { font-size: 24pt; margin: 18px 0 8px; font-weight: normal; }
  .cover .lead { font-size: 13pt; color: #555; max-width: 135mm; }
  .cover .meta { margin-top: 40px; color: #777; font-size: 10pt; border-top: 3px solid #c9800c; padding-top: 12px; width: 120mm; }
  .contents { page-break-after: always; }
  .contents ol { list-style: none; padding: 0; columns: 1; }
  .contents li { padding: 7px 0; border-bottom: 1px solid #e6e2d8; font-size: 11.5pt; }
  .contents li span { display: inline-block; width: 28px; color: #c9800c; font-weight: bold; }
  .howto { background: #faf3e3; border-left: 4px solid #c9800c; padding: 10px 14px; border-radius: 4px; margin: 10px 0 0; }
  .chapter { page-break-before: always; }
  .eyebrow { color: #c9800c; text-transform: uppercase; letter-spacing: 1.5px; font-size: 8.5pt; font-weight: bold; margin: 0; }
  .box { background: #f4f6fb; border-left: 4px solid #1d2545; padding: 10px 14px; border-radius: 4px; margin: 12px 0; page-break-inside: avoid; }
  .box.example { background: #faf3e3; border-left-color: #c9800c; }
  .box-title { font-weight: bold; color: #1d2545; margin-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0 12px; font-size: 9.6pt; page-break-inside: auto; }
  tr { page-break-inside: avoid; }
  th { background: #1d2545; color: #fff; text-align: left; padding: 6px 8px; font-weight: 600; }
  td { padding: 6px 8px; border-bottom: 1px solid #e6e2d8; vertical-align: top; }
  tbody tr:nth-child(odd) td { background: #fbfaf7; }
  .box table td { background: transparent !important; }
  .steps { counter-reset: step; list-style: none; padding-left: 0; }
  .steps li { counter-increment: step; position: relative; padding-left: 34px; margin-bottom: 8px; }
  .steps li::before { content: counter(step); position: absolute; left: 0; top: 0; width: 22px; height: 22px; border-radius: 50%; background: #c9800c; color: #fff; font-weight: bold; font-size: 9.5pt; text-align: center; line-height: 22px; }
  .diagram { display: flex; align-items: stretch; gap: 8px; margin: 14px 0 6px; }
  .node { flex: 1; border: 1.5px solid #1d2545; border-radius: 8px; padding: 10px; text-align: center; }
  .node b { display: block; margin-bottom: 4px; }
  .node span { font-size: 9pt; color: #555; }
  .node.strong { background: #1d2545; }
  .node.strong b, .node.strong span { color: #fff; }
  .arrow { align-self: center; font-size: 20pt; color: #c9800c; }
  .faq dt { font-weight: bold; color: #1d2545; margin-top: 10px; }
  .faq dd { margin: 3px 0 0; }
</style></head><body>
<div class="cover">
  <p class="brand">Aimi<span>fy</span></p>
  <h1>Aimify, explained</h1>
  <p class="lead">How the whole system works and everything it does, step by step and in plain language. No technical knowledge needed.</p>
  <div class="meta">Version as of ${AS_OF}<br>For business owners, staff and anyone new to Aimify</div>
</div>
<div class="contents">
  <p class="eyebrow">Inside</p>
  <h2>Contents</h2>
  <ol>${contents}</ol>
  <div class="howto"><b>How to read this guide.</b> Chapters 1 to 4 explain what Aimify is and how to start. Chapters 5 to 15 follow the everyday work in the order a business usually meets it. Chapters 16 to 19 cover safety, payment and what is coming. Unfamiliar words are explained in chapter 20.</div>
</div>
${body}
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

const dir = mkdtempSync(path.join(tmpdir(), "aimify-guide-"));
const htmlPath = path.join(dir, "guide.html");
writeFileSync(htmlPath, html);
if (process.env.GUIDE_HTML) writeFileSync(process.env.GUIDE_HTML, html);

execFileSync(
  browser,
  [
    "--headless",
    "--disable-gpu",
    "--no-pdf-header-footer",
    `--user-data-dir=${path.join(dir, "profile")}`,
    `--print-to-pdf=${OUT}`,
    pathToFileURL(htmlPath).href,
  ],
  { stdio: "ignore" },
);

console.log(`Wrote ${OUT} (${chapters.length} chapters)`);
