# Kickoff prompt for the aimify-desktop Claude Code session

Paste the contents below (everything after the `---`) into a fresh Claude
Code session started inside the `aimify-desktop` project folder. That session
has none of this conversation's context, so this prompt plus
`docs/desktop-api.md` (copy it into that project too) are its entire starting
point.

---

I'm building **Aimify**, a multi-tenant inventory and warehouse management
platform for wholesalers, distributors and retailers. The actual inventory
software — the thing this project *is* — is a **Flutter desktop app**
(Windows/macOS/Linux to start, with mobile as a later phase reusing the same
codebase). A separate sibling project, `aimify-web` (Next.js), already
exists and handles the marketing site, account signup/login,
organization/subscription management, and a super-admin panel. This app is
the actual product people use day-to-day once they've signed up there.

## What already exists and is real

`aimify-web` exposes a small token-based API this app should authenticate
against:

- `POST /api/v1/auth/login` — email + password → JWT (30-day expiry)
- `GET /api/v1/me` — `Authorization: Bearer <token>` → the signed-in user's
  profile, organization, and role

Full contract — exact request/response JSON shapes, every error case — is in
`docs/desktop-api.md`. Treat it as the source of truth for these two
endpoints; don't guess at the shape. Base URL for local dev is
`http://localhost:3000` (the Next.js app running there).

**Nothing else exists on the backend yet.** No products, inventory,
purchases, sales, customers, suppliers, or expenses tables or endpoints.
That's separate backend work that hasn't been scoped yet.

## What I want built here, in order

1. **Real and connected**: a login screen calling `/api/v1/auth/login`,
   storing the returned token securely (e.g. `flutter_secure_storage`, not
   plain shared preferences), and a home/dashboard screen that calls
   `/api/v1/me` and shows the signed-in user's name, organization, role, and
   subscription status. If `organization` comes back `null` (the user
   hasn't finished onboarding on the web app yet), show a clear message
   telling them to finish setup there — not a broken/empty screen.
2. **App shell**: navigation (sidebar or similar) for the modules below,
   branded consistently (see Design), even before each screen has real data
   behind it.
3. **UI for the core inventory modules**, using clearly-fake/representative
   data for now. Build these as real, polished screens, but keep the data
   layer isolated — one well-named service/repository per module — so
   swapping in real API calls later is a small change, not a rewrite:
   - Product management (SKU, barcode, name, category, unit of measure,
     purchase/selling price, stock levels)
   - Inventory (current stock, stock-in/out/adjustment, low-stock alerts)
   - Purchases (supplier, products, quantities, cost, payment status)
   - Sales (customer, products, quantities, price, payment status,
     outstanding balance)
   - Customers (contact info, credit limit, balance, transaction history)
   - Suppliers (contact info, products supplied, balance)
   - Expenses (category, amount, date, payment method)
   - A dashboard/analytics screen (inventory value, today's sales,
     low-stock count, outstanding debt)

   Single warehouse only for now — multi-warehouse support is a later
   phase.

## Design

Match the Aimify brand already established on the web:

- Gold accent: `#d88b00` (light mode) / `#f2b233` (dark mode)
- Amber accent: `#f2b233` (light mode) / `#ffc95c` (dark mode)
- Ink/text: `#242424` (light mode) / `#f8f7f3` (dark mode)
- Paper/background: `#fdf7ec` (light mode) / `#171717` (dark mode)
- Headings in Space Grotesk; body text in Manrope, if both are reasonably
  available as Flutter-compatible fonts (Google Fonts has both)

Support light and dark mode. If `aimify-web` is accessible from this
project's filesystem, its `app/globals.css` has the full set of design
tokens for reference beyond just these core colors.

## Ground rules

- Be explicit in code/comments about what's wired to the real API versus
  using placeholder data — don't let that distinction get lost as this
  grows.
- Don't invent a local backend or persistence layer that could be mistaken
  for a working one. Mock data should look obviously like sample/seed data.
- Ask before making big architecture decisions (state management approach,
  routing package, etc.) rather than guessing silently — those are worth
  deciding deliberately, not untangling later.
