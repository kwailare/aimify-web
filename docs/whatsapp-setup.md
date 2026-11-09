# Setting up automatic WhatsApp messages

Aimify can send invoices, receipts, reminders of overdue amounts, purchase
orders and stock alerts on WhatsApp automatically. They go from **one
WhatsApp Business number owned by Aimify**, through Meta's WhatsApp Cloud
API, and name the sending business in the text. Until this is set up, the
website's WhatsApp page says automatic messages aren't switched on yet, and
the desktop app's "Send on WhatsApp" buttons work as normal (they open the
staff member's own WhatsApp, and need none of this).

## 1. The Meta side (once)

1. **Meta Business account**: create one at business.facebook.com for
   Aimify and complete **business verification** (company documents).
2. **WhatsApp Business app**: at developers.facebook.com, create an app of
   type *Business*, add the **WhatsApp** product, and link the Business
   account.
3. **Phone number**: add the number Aimify will send from (it must not be
   used in the WhatsApp phone app). Note its **Phone number ID**.
4. **Access token**: in Business Settings → System users, create a system
   user, give it the WhatsApp app with *Full control*, and generate a
   **permanent token** with `whatsapp_business_messaging` and
   `whatsapp_business_management`.
5. **App secret**: in the app's Settings → Basic.
6. **Payment method**: Meta charges per conversation started; add a card in
   WhatsApp Manager.

## 2. The message templates

Meta only lets a business start a conversation with a **pre-approved
template**. Create these five in WhatsApp Manager → Message templates,
category **Utility**, language **English** (`en`), with exactly these
names and bodies (the `{{n}}` are filled in by Aimify, in this order):

| Name | Body |
|---|---|
| `aimify_invoice` | Hello {{1}}, thank you for buying from {{2}}. Invoice {{3}}: total {{4}}, paid {{5}}, balance {{6}}. |
| `aimify_receipt` | Hello {{1}}, {{2}} received your payment of {{3}} ({{4}}). Your balance is now {{5}}. Thank you. |
| `aimify_payment_reminder` | Hello {{1}}, this is a friendly reminder from {{2}}: {{3}} is overdue on your account (due since {{4}}). Please get in touch to arrange payment. Thank you. |
| `aimify_purchase_order` | Hello {{1}}, {{2}} would like to order (purchase order {{3}}): {{4}}. Total {{5}}. Please confirm. Thank you. |
| `aimify_stock_alert` | {{1}}: {{2}} is {{3}} ({{4}} left, minimum {{5}}). Open Aimify to reorder. |

Sample values for Meta's review: *Ada Stores*, *Obi Distribution Ltd*,
*INV-0001*, *₦140,000*, *₦40,000*, *₦100,000*, *RCPT-0001*, *5 Nov 2026*,
*30 bag Rice 50kg*, *Rice 50kg (RICE-50)*, *running low*, *4*, *5*.

If a template's wording is changed, change it in
`lib/whatsapp/messages.ts` too: the parameters must stay in the same order.

## 3. Aimify's side (Vercel)

Add these environment variables to the **production** environment of the
`aimify-web` project in Vercel, then redeploy:

| Variable | Value |
|---|---|
| `WHATSAPP_TOKEN` | the permanent system-user token |
| `WHATSAPP_PHONE_NUMBER_ID` | the sending number's Phone number ID |
| `WHATSAPP_APP_SECRET` | the app secret (checks webhook signatures) |
| `WHATSAPP_VERIFY_TOKEN` | any long random text you choose (step 4) |
| `WHATSAPP_TEMPLATE_LANGUAGE` | optional; `en` unless the templates use another |

Do **not** set `WHATSAPP_PROVIDER` in production: `record` (test mode, used
on developers' computers) is ignored there anyway.

## 4. The webhook (delivery updates)

In the app's WhatsApp → Configuration:

- **Callback URL**: `https://www.aimify.app/api/webhooks/whatsapp`
- **Verify token**: the same text as `WHATSAPP_VERIFY_TOKEN`
- Subscribe to the **messages** field.

Meta checks the URL once; afterwards each message's *sent*, *delivered*,
*read* or *failed* shows on the business's WhatsApp page.

## 5. Check it

On the website, open **WhatsApp** in the dashboard: the status should say
*Connected*. Turn on Invoices for a test business, tick **WhatsApp OK** on
a customer with your own number in the desktop app, and make a sale to
them: the invoice arrives, and shows in *Recent messages*.

## How it behaves

- Each business chooses which messages it sends (WhatsApp page, Owner and
  Administrators). All start **off**.
- Customers and suppliers only get them when ticked **WhatsApp OK** (their
  consent); team members only get stock alerts when they turn them on for
  themselves, at the phone number in their Settings.
- Reminders go once a day (09:00 UTC, `/api/cron/whatsapp-reminders`) to
  customers with something overdue, at most every 3, 7, 14 or 30 days as
  the business chooses.
- The same message is never sent twice (a sale's invoice, a day's alert).
  A message WhatsApp refuses is logged as *Failed* with the reason.
