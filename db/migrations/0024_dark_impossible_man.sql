CREATE TABLE "sale_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizationId" uuid NOT NULL,
	"saleId" uuid NOT NULL,
	"productId" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"quantity" integer NOT NULL,
	"unitPrice" numeric NOT NULL,
	"listPrice" numeric NOT NULL,
	"unitCost" numeric DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sale_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizationId" uuid NOT NULL,
	"saleId" uuid NOT NULL,
	"amount" numeric NOT NULL,
	"method" text DEFAULT 'cash' NOT NULL,
	"note" text,
	"userId" uuid,
	"clientRef" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sale_payments_organizationId_clientRef_unique" UNIQUE("organizationId","clientRef")
);
--> statement-breakpoint
CREATE TABLE "sales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizationId" uuid NOT NULL,
	"number" integer NOT NULL,
	"reference" text NOT NULL,
	"customerId" uuid,
	"warehouseId" uuid NOT NULL,
	"status" text DEFAULT 'completed' NOT NULL,
	"saleDate" timestamp NOT NULL,
	"notes" text,
	"subtotal" numeric DEFAULT 0 NOT NULL,
	"discount" numeric DEFAULT 0 NOT NULL,
	"tax" numeric DEFAULT 0 NOT NULL,
	"total" numeric DEFAULT 0 NOT NULL,
	"amountPaid" numeric DEFAULT 0 NOT NULL,
	"overLimitApprovedBy" uuid,
	"voidedAt" timestamp,
	"voidedBy" uuid,
	"voidReason" text,
	"createdBy" uuid,
	"clientRef" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sales_organizationId_number_unique" UNIQUE("organizationId","number"),
	CONSTRAINT "sales_organizationId_clientRef_unique" UNIQUE("organizationId","clientRef")
);
--> statement-breakpoint
ALTER TABLE "credit_entries" ADD COLUMN "saleId" uuid;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "saleSeq" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD COLUMN "saleId" uuid;--> statement-breakpoint
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_organizationId_organizations_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_saleId_sales_id_fk" FOREIGN KEY ("saleId") REFERENCES "public"."sales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_productId_products_id_fk" FOREIGN KEY ("productId") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_payments" ADD CONSTRAINT "sale_payments_organizationId_organizations_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_payments" ADD CONSTRAINT "sale_payments_saleId_sales_id_fk" FOREIGN KEY ("saleId") REFERENCES "public"."sales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_payments" ADD CONSTRAINT "sale_payments_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_organizationId_organizations_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_customerId_customers_id_fk" FOREIGN KEY ("customerId") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_warehouseId_warehouses_id_fk" FOREIGN KEY ("warehouseId") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_overLimitApprovedBy_users_id_fk" FOREIGN KEY ("overLimitApprovedBy") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_voidedBy_users_id_fk" FOREIGN KEY ("voidedBy") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_createdBy_users_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sale_lines_sale_idx" ON "sale_lines" USING btree ("saleId");--> statement-breakpoint
CREATE INDEX "sale_payments_sale_idx" ON "sale_payments" USING btree ("saleId");--> statement-breakpoint
CREATE INDEX "sales_organization_idx" ON "sales" USING btree ("organizationId","saleDate");--> statement-breakpoint
CREATE INDEX "sales_customer_idx" ON "sales" USING btree ("organizationId","customerId");--> statement-breakpoint
ALTER TABLE "credit_entries" ADD CONSTRAINT "credit_entries_saleId_sales_id_fk" FOREIGN KEY ("saleId") REFERENCES "public"."sales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_saleId_sales_id_fk" FOREIGN KEY ("saleId") REFERENCES "public"."sales"("id") ON DELETE no action ON UPDATE no action;