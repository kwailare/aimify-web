# Update prompt for the aimify-desktop Claude Code session

Use this when the desktop app was started from `desktop-kickoff-prompt.md` (or
earlier) and needs to catch up with the website and API as of 26 September
2026.

How to use it:

1. Copy the current `docs/desktop-api.md` from `aimify-web` into the desktop
   project, replacing the old copy. It is the source of truth and has changed a
   lot.
2. Start a Claude Code session inside the `aimify-desktop` project folder.
3. Paste everything after the `---` below.

---

The Aimify website and API (`aimify-web`) changed a lot since this app was
last brought up to date. `docs/desktop-api.md` in this project was just
replaced with the current version. Read it fully first: it is the source of
truth, so don't guess at shapes or error codes. Then audit this app against the
checklist below, tell me what is missing or wrong, and fix it in the order
listed. Don't remove existing behaviour unless a point below says to.

Base URL for local dev is `http://localhost:3000`. Production is
`https://www.aimify.app`.

## 1. Sign-in and sessions

- `POST /api/v1/auth/login` now returns `{ token, expiresAt }`. Send an
  optional `deviceName` (for example the computer's name) so the person sees
  a friendly label under Settings, Signed-in devices, on the website.
- Two-factor authentication exists. When a user has it on, a correct password
  without a code returns `401` with `"code": "two_factor_required"`. Show a
  6-digit code prompt (also accept a backup code like `abcd-efgh`) and call
  login again with the same email and password plus `code`. A wrong or reused
  code returns `401` with `"code": "invalid_two_factor_code"`. Wrong codes are
  rate limited (`429`), same as wrong passwords.
- Tokens are now tied to server-side sessions and can be revoked at any time:
  the user signs the device out on the website, changes or resets their
  password, an admin resets it, or they are removed from the team. Treat **any
  `401` on an authenticated call as "the session ended"**: clear the stored
  token, stop background work, and go to the sign-in screen with a short
  message.
- Add sign-out that calls `POST /api/v1/auth/logout` and then discards the
  token, even if the call fails.
- Store the token in the OS secure store (Windows Credential Manager, macOS
  Keychain, libsecret), not in plain preferences.

## 2. Account, organization and plan (`GET /api/v1/me`)

Call `/me` after login and on app start, and refresh it periodically and
after any `402`/`403`. It now returns:

- `user.emailVerified`. Unverified people are held on the website; if false,
  tell them to confirm their email on the website.
- `organization`: name, industry, currency, `logoUrl`, registration number,
  address, phone, email, tax name and rate, timezone, date format,
  `subscriptionStatus`, `trialEndsAt`. Use `currency`, timezone, date format and
  tax rate for every amount and date in the app instead of hardcoding NGN.
  Show the company name and logo in the app shell.
- `role` and `permissions` (see section 3).
- `plan`: `{ name, limits: { users, warehouses, products }, usage: {...} }`
  where a `null` limit means unlimited. Show usage where it matters (for
  example "12 of 50 products") and disable "add" actions at the limit.

## 3. Roles and permissions

Every person has one of: Owner, Administrator, Warehouse Manager, Inventory
Staff, Sales Staff, Accountant / Finance. Drive the UI from the `permissions`
array in `/me`, not from the role name:

- `products.write`, `products.archive`, `catalog.write`, `warehouses.manage`,
  `stock.out`, `stock.adjust`.
- Hide or disable controls the user can't use. Sales Staff can only record
  stock-out. Accountant / Finance is read-only.
- Still handle the server's answer: `403` with `"code": "forbidden_role"`
  means the permission changed since the last `/me`. Refresh `/me` and show a
  plain message.

## 4. Subscription gating

Only `trial`, `active` and `past_due` may use the API. Any other endpoint
returns `402` (`pending`, `expired`, `cancelled`) or `403` (`suspended`) with
`"code": "subscription_inactive"` and a ready-to-show `error`. Build one
locked screen for this: show the message, a button that opens the website's
billing page, and a "Check again" button that re-calls `/me`. Show a banner
for `trial` with days left from `trialEndsAt`, and for `past_due`. Login and
`/me` stay open so a locked-out person can still see why.

## 5. Plan limits

Creating or re-activating a warehouse or product beyond the plan returns
`403` with `"code": "plan_limit"`, `limit` and `used`. Show a clear message
("Your plan allows 1 active warehouse") and, for the owner, a link to the
website's billing page. Archiving a product or disabling a warehouse frees a
slot.

## 6. Data endpoints that now exist

Wire the app to these if it doesn't already, and keep money and stock
integers/decimals exactly as the API returns them:

- Products: list (search, archived filter), get, create, edit, archive, image
  upload/remove (PNG, JPEG or WebP up to 2 MB). Fields include SKU, barcode,
  name, description, **brand**, **imageUrl**, category, unit, purchase and
  selling price, min stock, **max stock**, current stock, status.
- Categories and units: list, add, delete. Default units are seeded and new
  values used on a product are added automatically.
- Warehouses: list, create, edit, disable.
- Stock movements: create (`stock_in`, `stock_out`, `adjustment`, `count`) and
  list. Read the response's `alert` (`low_stock` or `out_of_stock`) and show it
  immediately. Movement rows include who did it and stock before and after.
- Stock alerts: `GET /api/v1/alerts/stock` for a low-stock / out-of-stock
  panel and badge.

## 7. Multi-user reality

Organizations now have several people with different roles (the owner invites
them on the website). So:

- Show who did each stock movement.
- Never assume the signed-in person is the only user, and never cache one
  person's data under another's login.
- Removal from a team ends the session (`401`), which section 1 already
  handles.

## 8. Things that are still not on the backend

There are no endpoints yet for customers, suppliers, purchases, sales, credit,
expenses, transfers, returns, per-warehouse stock balances or inventory
valuation. Don't call anything for them. If the app already has screens for
these, keep them working from local storage and mark them clearly in the code
as local-only so we can plan sync later. Stock is one number per product for
the whole organization today (movements record which warehouse they happened
in, but stock is not split by warehouse).

## 9. Error handling and behaviour to apply everywhere

- One API client that adds the bearer token, parses `{ error, code }`, and
  maps: `401` to sign-in, `402/403 subscription_inactive` to the locked
  screen, `403 forbidden_role` and `403 plan_limit` to friendly messages,
  `429` to "try again in a few minutes", and network errors to an offline
  banner with retry. Never show raw JSON to users.
- Respect the rate limit on login; don't auto-retry failed logins.
- Never log tokens, passwords or two-factor codes.

## What to report back

Before changing code, give me a short table: each numbered item above, whether
the app already does it, and what you'll change. Then implement in order 1 to
5 first, run the app against the local backend with a test account (a
throwaway trial organization, plus one team member with the Sales Staff role
to check the permission-driven UI, and one account with two-factor turned on),
and tell me what you verified and what you could not.
