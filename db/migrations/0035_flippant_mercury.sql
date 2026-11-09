CREATE TABLE "whatsapp_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizationId" uuid NOT NULL,
	"kind" text NOT NULL,
	"toPhone" text NOT NULL,
	"partyType" text,
	"partyId" uuid,
	"userId" uuid,
	"recordId" uuid,
	"dedupeKey" text NOT NULL,
	"provider" text NOT NULL,
	"template" text NOT NULL,
	"body" text NOT NULL,
	"status" text DEFAULT 'sending' NOT NULL,
	"providerMessageId" text,
	"error" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "whatsapp_messages_organizationId_dedupeKey_unique" UNIQUE("organizationId","dedupeKey")
);
--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "whatsappOptIn" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "whatsappSettings" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "whatsappOptIn" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "whatsappAlerts" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_organizationId_organizations_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "whatsapp_messages_org_created_idx" ON "whatsapp_messages" USING btree ("organizationId","createdAt");--> statement-breakpoint
CREATE INDEX "whatsapp_messages_provider_id_idx" ON "whatsapp_messages" USING btree ("providerMessageId");