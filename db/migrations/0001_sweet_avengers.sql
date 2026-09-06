ALTER TABLE "memberships" ALTER COLUMN "userId" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "memberships" ALTER COLUMN "organizationId" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ALTER COLUMN "createdAt" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "createdAt" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "industry" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "warehouseName" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "subscriptionStatus" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "trialEndsAt" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "name" text NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "createdAt" timestamp DEFAULT now() NOT NULL;