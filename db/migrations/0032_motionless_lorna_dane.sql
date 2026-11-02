ALTER TABLE "organizations" ADD COLUMN "scheduledPlanId" uuid;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "planId" uuid;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_scheduledPlanId_plans_id_fk" FOREIGN KEY ("scheduledPlanId") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_planId_plans_id_fk" FOREIGN KEY ("planId") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;