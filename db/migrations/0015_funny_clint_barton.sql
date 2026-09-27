CREATE TABLE "credit_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizationId" uuid NOT NULL,
	"partyType" text NOT NULL,
	"partyId" uuid NOT NULL,
	"kind" text NOT NULL,
	"amount" numeric NOT NULL,
	"note" text,
	"userId" uuid,
	"clientRef" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "credit_entries_organizationId_clientRef_unique" UNIQUE("organizationId","clientRef")
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizationId" uuid NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"email" text,
	"address" text,
	"notes" text,
	"creditLimit" numeric DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizationId" uuid NOT NULL,
	"name" text NOT NULL,
	"contactPerson" text,
	"phone" text,
	"email" text,
	"address" text,
	"notes" text,
	"status" text DEFAULT 'active' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "credit_entries" ADD CONSTRAINT "credit_entries_organizationId_organizations_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_entries" ADD CONSTRAINT "credit_entries_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_organizationId_organizations_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_organizationId_organizations_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "credit_entries_party_idx" ON "credit_entries" USING btree ("organizationId","partyType","partyId","createdAt");--> statement-breakpoint
CREATE INDEX "customers_organization_idx" ON "customers" USING btree ("organizationId");--> statement-breakpoint
CREATE INDEX "suppliers_organization_idx" ON "suppliers" USING btree ("organizationId");