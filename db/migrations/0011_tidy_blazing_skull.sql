CREATE TABLE "plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"priceMonthly" numeric DEFAULT 0 NOT NULL,
	"maxUsers" integer,
	"maxWarehouses" integer,
	"maxProducts" integer,
	"isDefault" boolean DEFAULT false NOT NULL,
	"isActive" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "planId" uuid;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_planId_plans_id_fk" FOREIGN KEY ("planId") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
INSERT INTO "plans" ("name", "description", "priceMonthly", "maxUsers", "maxWarehouses", "maxProducts", "isDefault") VALUES ('Full Access', 'One secure, auditable workspace for your entire business.', 25000, NULL, 1, NULL, true);--> statement-breakpoint
UPDATE "organizations" SET "planId" = (SELECT "id" FROM "plans" WHERE "isDefault" = true LIMIT 1) WHERE "planId" IS NULL;
