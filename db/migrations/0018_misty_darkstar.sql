ALTER TABLE "organizations" ADD COLUMN "setupCompletedAt" timestamp;--> statement-breakpoint
UPDATE "organizations" SET "setupCompletedAt" = now() WHERE EXISTS (SELECT 1 FROM "products" WHERE "products"."organizationId" = "organizations"."id");
