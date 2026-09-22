# Aimify Desktop API — reference

For the Aimify desktop client (Flutter) to authenticate against and read data
from the `aimify-web` backend. Copy this file into the desktop project so a
fresh session there has the contract without needing this conversation's
history.

## How auth works

The web dashboard authenticates via a browser session cookie (NextAuth). A
native desktop client has no browser to hold that cookie, so it uses a
separate, token-based path instead:

1. `POST /api/v1/auth/login` with an email + password → get back a signed JWT.
2. Send that JWT as `Authorization: Bearer <token>` on every subsequent
   request.
3. The token is a stateless JWT (HS256, 30-day expiry). There is no
   server-side revocation yet — "logging out" on the client just means
   discarding the stored token locally. Once it expires, log in again.

The user must already have an Aimify account (created via the web app's
`/signup`) before they can log in from the desktop client — this API does not
currently expose account creation.

## Base URL

| Environment | URL |
|---|---|
| Local dev | `http://localhost:3000` |
| Production | *(fill in once deployed — your Vercel domain)* |

## `POST /api/v1/auth/login`

Request:

```json
{
  "email": "you@company.com",
  "password": "your-password"
}
```

Success — `200`:

```json
{
  "token": "eyJhbGciOiJIUzI1NiJ9...."
}
```

Failure — `400` (missing fields) or `401` (wrong email/password):

```json
{
  "error": "Invalid email or password."
}
```

## `GET /api/v1/me`

Header required: `Authorization: Bearer <token>`

Success — `200`:

```json
{
  "user": {
    "id": "uuid",
    "name": "Ada Obi",
    "email": "ada@company.com",
    "phone": "+2348000000000"
  },
  "organization": {
    "id": "uuid",
    "name": "Obi Distribution Ltd",
    "industry": "Wholesale",
    "currency": "NGN",
    "warehouseName": "Main warehouse — Lagos",
    "subscriptionStatus": "trial",
    "trialEndsAt": "2026-09-26T00:00:00.000Z"
  },
  "role": "Owner"
}
```

If the signed-in user hasn't finished onboarding yet (no organization created,
or no active subscription), `organization` and `role` come back as `null`.
The desktop client should treat that as "send them to finish onboarding on
the web app" rather than assuming it's an error.

Failure — `401` (missing/invalid/expired token):

```json
{
  "error": "Unauthorized."
}
```

Failure — `404` (token is valid but the account no longer exists, e.g. it was
deleted after the token was issued):

```json
{
  "error": "User not found."
}
```

## `GET /api/v1/warehouses`

Header required: `Authorization: Bearer <token>`. Returns every warehouse
belonging to the signed-in user's organization (MVP is single-warehouse, but
this is real, so an org could in principle have more than one row here).

Success — `200`:

```json
{
  "warehouses": [
    {
      "id": "uuid",
      "organizationId": "uuid",
      "name": "Main Warehouse",
      "address": null,
      "managerName": null,
      "phone": null,
      "status": "active",
      "createdAt": "2026-09-22T19:00:00.000Z"
    }
  ]
}
```

You'll need a `warehouseId` from this list before recording any stock
movement below.

## `GET /api/v1/products` and `POST /api/v1/products`

Header required: `Authorization: Bearer <token>`.

`GET` returns every product for the organization (no pagination yet — fine
at MVP scale, revisit if this ever needs to handle thousands of SKUs).

`POST` creates a product. Request:

```json
{
  "sku": "SKU-001",
  "name": "Bag of Rice (50kg)",
  "barcode": "1234567890123",
  "description": "optional",
  "category": "Grains",
  "unit": "bag",
  "purchasePrice": 30000,
  "sellingPrice": 35000,
  "minStock": 5
}
```

Only `sku` and `name` are required; everything else defaults (`unit` →
`"piece"`, prices/`minStock` → `0`). `sku` must be unique *within the
organization* (a 409 comes back if it's reused) — it's fine for two
different organizations to both have a `"SKU-001"`.

Success — `201`:

```json
{
  "product": {
    "id": "uuid",
    "organizationId": "uuid",
    "sku": "SKU-001",
    "barcode": null,
    "name": "Bag of Rice (50kg)",
    "description": null,
    "category": "Grains",
    "unit": "bag",
    "purchasePrice": 30000,
    "sellingPrice": 35000,
    "minStock": 5,
    "currentStock": 0,
    "status": "active",
    "createdAt": "2026-09-22T19:21:17.660Z",
    "updatedAt": "2026-09-22T19:21:17.660Z"
  }
}
```

`currentStock` always starts at `0` — it only ever changes through the
movements endpoint below, never by editing a product directly. There's no
`PATCH`/update-product endpoint yet, only create + list.

Failures: `400` (missing `sku`/`name`), `401` (bad/missing token), `409`
(SKU already exists in this org).

## `GET /api/v1/inventory/movements` and `POST /api/v1/inventory/movements`

Header required: `Authorization: Bearer <token>`. This is the *only* way
`currentStock` on a product ever changes — there's no other endpoint that
touches it, by design, so every stock change has a corresponding movement
record.

`GET` returns the most recent 100 movements for the organization, newest
first. Add `?productId=<uuid>` to scope it to one product's history.

`POST` records a movement. Request:

```json
{
  "productId": "uuid",
  "warehouseId": "uuid",
  "type": "stock_in",
  "quantity": 100,
  "reason": "optional, e.g. \"Initial purchase\""
}
```

- `type` must be one of `stock_in`, `stock_out`, `adjustment`, `count`.
- `quantity` is a **signed delta**, not an absolute value — positive
  increases stock, negative decreases it (so `stock_out` requests should
  send a *negative* number, e.g. `-30` to remove 30 units). This was
  deliberately verified: 25 concurrent movement requests against the same
  product were fired at once as a test, and the final stock value exactly
  matched the sum of all deltas with zero lost updates — the update is a
  single atomic Postgres arithmetic statement (`current_stock = current_stock
  + quantity`), not a read-then-write from application code, so concurrent
  requests can't race each other.

Success — `201`:

```json
{
  "movement": {
    "id": "uuid",
    "organizationId": "uuid",
    "warehouseId": "uuid",
    "productId": "uuid",
    "userId": "uuid",
    "type": "stock_in",
    "quantity": 100,
    "reason": "Initial purchase",
    "previousStock": 0,
    "newStock": 100,
    "createdAt": "2026-09-22T19:21:37.865Z"
  },
  "currentStock": 100
}
```

Failures: `400` (missing/invalid `type`, missing `productId`/`warehouseId`,
or a zero/missing `quantity`), `401`, `404` (no product with that ID in this
organization).

## What this API does *not* do yet

Purchases, sales, customers, suppliers, and expenses don't exist yet —
products and inventory movements are the first slice, since every other
module (a purchase increases stock, a sale decreases it, etc.) is built on
top of those two. There's also no product-update/delete endpoint yet, no
low-stock-alert endpoint (though `minStock` is stored, so that's a query away
once needed), and no image upload for products (no file storage is wired up
in `aimify-web` yet).

## Where this lives, if it needs to change

All of this is implemented in the `aimify-web` repo:

- `lib/credentials.ts` — shared password verification (also used by the web
  login)
- `lib/api-auth.ts` — JWT creation/verification (`createApiToken`,
  `verifyApiToken`)
- `lib/org.ts` — `getOrgContextForUser(userId)` is the query `/me` uses
- `lib/api-context.ts` — `getApiOrgContext(request)`, the shared
  token-to-organization resolution every route below `/me` uses
- `app/api/v1/auth/login/route.ts`
- `app/api/v1/me/route.ts`
- `app/api/v1/warehouses/route.ts`
- `app/api/v1/products/route.ts`
- `app/api/v1/inventory/movements/route.ts`
- `db/schema.ts` — `warehouses`, `products`, `stock_movements` tables

New endpoints get added under `app/api/v1/`, each verifying its own Bearer
token via `getApiOrgContext` the same way these do.
