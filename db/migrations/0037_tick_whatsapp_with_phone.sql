-- Customers and suppliers who already have a phone number get the
-- business's WhatsApp messages (each business still chooses which, all
-- off by default), unless someone unticks them.
UPDATE "customers" SET "whatsappOptIn" = true WHERE "phone" IS NOT NULL AND btrim("phone") <> '' AND "whatsappOptIn" = false;--> statement-breakpoint
UPDATE "suppliers" SET "whatsappOptIn" = true WHERE "phone" IS NOT NULL AND btrim("phone") <> '' AND "whatsappOptIn" = false;
