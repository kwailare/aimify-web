CREATE TABLE "customer_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizationId" uuid NOT NULL,
	"name" text NOT NULL,
	"defaultCreditLimit" numeric DEFAULT 0 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "customer_types_organizationId_name_unique" UNIQUE("organizationId","name")
);
--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "customerTypeId" uuid;--> statement-breakpoint
ALTER TABLE "customer_types" ADD CONSTRAINT "customer_types_organizationId_organizations_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_customerTypeId_customer_types_id_fk" FOREIGN KEY ("customerTypeId") REFERENCES "public"."customer_types"("id") ON DELETE no action ON UPDATE no action;