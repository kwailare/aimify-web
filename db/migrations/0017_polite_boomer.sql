ALTER TABLE "customers" ADD COLUMN "balance" numeric DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "balance" numeric DEFAULT 0 NOT NULL;