CREATE TABLE "expense_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizationId" uuid NOT NULL,
	"name" text NOT NULL,
	"monthlyBudget" numeric DEFAULT 0 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "expense_categories_organizationId_name_unique" UNIQUE("organizationId","name")
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizationId" uuid NOT NULL,
	"number" integer NOT NULL,
	"reference" text NOT NULL,
	"categoryId" uuid NOT NULL,
	"description" text,
	"amount" numeric NOT NULL,
	"expenseDate" timestamp NOT NULL,
	"paymentMethod" text DEFAULT 'cash' NOT NULL,
	"warehouseId" uuid,
	"payee" text,
	"receiptNumber" text,
	"attachmentUrl" text,
	"attachmentName" text,
	"attachmentType" text,
	"status" text DEFAULT 'recorded' NOT NULL,
	"voidReason" text,
	"voidedAt" timestamp,
	"voidedBy" uuid,
	"recurringId" uuid,
	"createdBy" uuid,
	"updatedBy" uuid,
	"clientRef" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "expenses_organizationId_number_unique" UNIQUE("organizationId","number"),
	CONSTRAINT "expenses_organizationId_clientRef_unique" UNIQUE("organizationId","clientRef")
);
--> statement-breakpoint
CREATE TABLE "recurring_expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizationId" uuid NOT NULL,
	"categoryId" uuid NOT NULL,
	"description" text NOT NULL,
	"amount" numeric NOT NULL,
	"paymentMethod" text DEFAULT 'cash' NOT NULL,
	"warehouseId" uuid,
	"payee" text,
	"frequency" text NOT NULL,
	"nextDueDate" timestamp NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"createdBy" uuid,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "expenseSeq" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "expense_categories" ADD CONSTRAINT "expense_categories_organizationId_organizations_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_organizationId_organizations_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_categoryId_expense_categories_id_fk" FOREIGN KEY ("categoryId") REFERENCES "public"."expense_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_warehouseId_warehouses_id_fk" FOREIGN KEY ("warehouseId") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_voidedBy_users_id_fk" FOREIGN KEY ("voidedBy") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_recurringId_recurring_expenses_id_fk" FOREIGN KEY ("recurringId") REFERENCES "public"."recurring_expenses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_createdBy_users_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_updatedBy_users_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_expenses" ADD CONSTRAINT "recurring_expenses_organizationId_organizations_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_expenses" ADD CONSTRAINT "recurring_expenses_categoryId_expense_categories_id_fk" FOREIGN KEY ("categoryId") REFERENCES "public"."expense_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_expenses" ADD CONSTRAINT "recurring_expenses_warehouseId_warehouses_id_fk" FOREIGN KEY ("warehouseId") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_expenses" ADD CONSTRAINT "recurring_expenses_createdBy_users_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "expenses_org_date_idx" ON "expenses" USING btree ("organizationId","expenseDate");--> statement-breakpoint
CREATE INDEX "recurring_expenses_org_idx" ON "recurring_expenses" USING btree ("organizationId");