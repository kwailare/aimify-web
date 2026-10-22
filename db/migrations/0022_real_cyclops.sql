CREATE TABLE "purchase_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizationId" uuid NOT NULL,
	"purchaseId" uuid NOT NULL,
	"productId" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"quantity" integer NOT NULL,
	"unitCost" numeric NOT NULL,
	"receivedQuantity" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizationId" uuid NOT NULL,
	"purchaseId" uuid NOT NULL,
	"amount" numeric NOT NULL,
	"note" text,
	"userId" uuid,
	"clientRef" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "purchase_payments_organizationId_clientRef_unique" UNIQUE("organizationId","clientRef")
);
--> statement-breakpoint
CREATE TABLE "purchase_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizationId" uuid NOT NULL,
	"purchaseId" uuid NOT NULL,
	"userId" uuid,
	"clientRef" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "purchase_receipts_organizationId_clientRef_unique" UNIQUE("organizationId","clientRef")
);
--> statement-breakpoint
CREATE TABLE "purchases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizationId" uuid NOT NULL,
	"number" integer NOT NULL,
	"reference" text NOT NULL,
	"supplierId" uuid NOT NULL,
	"warehouseId" uuid NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"orderDate" timestamp NOT NULL,
	"expectedDate" timestamp,
	"notes" text,
	"subtotal" numeric DEFAULT 0 NOT NULL,
	"discount" numeric DEFAULT 0 NOT NULL,
	"tax" numeric DEFAULT 0 NOT NULL,
	"total" numeric DEFAULT 0 NOT NULL,
	"amountPaid" numeric DEFAULT 0 NOT NULL,
	"postedAt" timestamp,
	"receivedAt" timestamp,
	"cancelledAt" timestamp,
	"createdBy" uuid,
	"clientRef" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "purchases_organizationId_number_unique" UNIQUE("organizationId","number"),
	CONSTRAINT "purchases_organizationId_clientRef_unique" UNIQUE("organizationId","clientRef")
);
--> statement-breakpoint
ALTER TABLE "credit_entries" ADD COLUMN "purchaseId" uuid;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "purchaseSeq" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD COLUMN "purchaseId" uuid;--> statement-breakpoint
ALTER TABLE "purchase_lines" ADD CONSTRAINT "purchase_lines_organizationId_organizations_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_lines" ADD CONSTRAINT "purchase_lines_purchaseId_purchases_id_fk" FOREIGN KEY ("purchaseId") REFERENCES "public"."purchases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_lines" ADD CONSTRAINT "purchase_lines_productId_products_id_fk" FOREIGN KEY ("productId") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_payments" ADD CONSTRAINT "purchase_payments_organizationId_organizations_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_payments" ADD CONSTRAINT "purchase_payments_purchaseId_purchases_id_fk" FOREIGN KEY ("purchaseId") REFERENCES "public"."purchases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_payments" ADD CONSTRAINT "purchase_payments_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_organizationId_organizations_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_purchaseId_purchases_id_fk" FOREIGN KEY ("purchaseId") REFERENCES "public"."purchases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_organizationId_organizations_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_supplierId_suppliers_id_fk" FOREIGN KEY ("supplierId") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_warehouseId_warehouses_id_fk" FOREIGN KEY ("warehouseId") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_createdBy_users_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "purchase_lines_purchase_idx" ON "purchase_lines" USING btree ("purchaseId");--> statement-breakpoint
CREATE INDEX "purchase_payments_purchase_idx" ON "purchase_payments" USING btree ("purchaseId");--> statement-breakpoint
CREATE INDEX "purchase_receipts_purchase_idx" ON "purchase_receipts" USING btree ("purchaseId");--> statement-breakpoint
CREATE INDEX "purchases_organization_idx" ON "purchases" USING btree ("organizationId","createdAt");--> statement-breakpoint
CREATE INDEX "purchases_supplier_idx" ON "purchases" USING btree ("organizationId","supplierId");--> statement-breakpoint
ALTER TABLE "credit_entries" ADD CONSTRAINT "credit_entries_purchaseId_purchases_id_fk" FOREIGN KEY ("purchaseId") REFERENCES "public"."purchases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_purchaseId_purchases_id_fk" FOREIGN KEY ("purchaseId") REFERENCES "public"."purchases"("id") ON DELETE no action ON UPDATE no action;