CREATE TABLE "subscription_notices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizationId" uuid NOT NULL,
	"kind" text NOT NULL,
	"period" text NOT NULL,
	"sentAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "subscription_notices_organizationId_kind_period_unique" UNIQUE("organizationId","kind","period")
);
--> statement-breakpoint
ALTER TABLE "subscription_notices" ADD CONSTRAINT "subscription_notices_organizationId_organizations_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;