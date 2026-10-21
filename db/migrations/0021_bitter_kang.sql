CREATE TABLE "product_stock" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizationId" uuid NOT NULL,
	"productId" uuid NOT NULL,
	"warehouseId" uuid NOT NULL,
	"quantity" integer DEFAULT 0 NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "product_stock_productId_warehouseId_unique" UNIQUE("productId","warehouseId")
);
--> statement-breakpoint
ALTER TABLE "product_stock" ADD CONSTRAINT "product_stock_organizationId_organizations_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_stock" ADD CONSTRAINT "product_stock_productId_products_id_fk" FOREIGN KEY ("productId") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_stock" ADD CONSTRAINT "product_stock_warehouseId_warehouses_id_fk" FOREIGN KEY ("warehouseId") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "product_stock_warehouse_idx" ON "product_stock" USING btree ("organizationId","warehouseId");--> statement-breakpoint
INSERT INTO "product_stock" ("organizationId", "productId", "warehouseId", "quantity")
SELECT m."organizationId", m."productId", m."warehouseId", SUM(m."quantity")::integer
FROM "stock_movements" m
GROUP BY m."organizationId", m."productId", m."warehouseId";--> statement-breakpoint
INSERT INTO "product_stock" ("organizationId", "productId", "warehouseId", "quantity")
SELECT p."organizationId", p."id", w."id", p."currentStock" - COALESCE(s.total, 0)
FROM "products" p
LEFT JOIN (
  SELECT "productId", SUM("quantity")::integer AS total FROM "product_stock" GROUP BY "productId"
) s ON s."productId" = p."id"
JOIN LATERAL (
  SELECT "id" FROM "warehouses" WHERE "organizationId" = p."organizationId" ORDER BY "createdAt" LIMIT 1
) w ON true
WHERE p."currentStock" <> COALESCE(s.total, 0)
ON CONFLICT ("productId", "warehouseId") DO UPDATE SET "quantity" = "product_stock"."quantity" + EXCLUDED."quantity";
