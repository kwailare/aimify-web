CREATE TABLE "two_factor_backup_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" uuid NOT NULL,
	"codeHash" text NOT NULL,
	"usedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "twoFactorSecret" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "twoFactorEnabledAt" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "twoFactorLastStep" integer;--> statement-breakpoint
ALTER TABLE "two_factor_backup_codes" ADD CONSTRAINT "two_factor_backup_codes_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "two_factor_backup_codes_user_idx" ON "two_factor_backup_codes" USING btree ("userId");