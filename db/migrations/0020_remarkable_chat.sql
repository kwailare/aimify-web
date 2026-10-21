ALTER TABLE "products" ADD COLUMN "supplierId" uuid;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_supplierId_suppliers_id_fk" FOREIGN KEY ("supplierId") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "products_supplier_idx" ON "products" USING btree ("organizationId","supplierId");