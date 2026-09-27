CREATE TABLE "payment_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"eventKey" text NOT NULL,
	"type" text NOT NULL,
	"reference" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "payment_events_eventKey_unique" UNIQUE("eventKey")
);
--> statement-breakpoint
CREATE TABLE "payment_methods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizationId" uuid NOT NULL,
	"authorizationCode" text NOT NULL,
	"email" text NOT NULL,
	"customerCode" text,
	"last4" text,
	"brand" text,
	"expMonth" text,
	"expYear" text,
	"bank" text,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "payment_methods_organizationId_unique" UNIQUE("organizationId")
);
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "currentPeriodEnd" timestamp;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "cancelAtPeriodEnd" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "renewalAttempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "lastRenewalAttemptAt" timestamp;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "kind" text DEFAULT 'checkout' NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "channel" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "userId" uuid;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "periodStart" timestamp;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "periodEnd" timestamp;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "failureReason" text;--> statement-breakpoint
ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_organizationId_organizations_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;