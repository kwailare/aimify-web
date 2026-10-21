import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { productStock, products } from "@/db/schema";

type MovementOutcome =
  | {
      status: "ok";
      warehouseStock: number;
      product: { currentStock: number; minStock: number; name: string; sku: string };
    }
  | { status: "not_found" }
  | { status: "insufficient"; available: number };

// Applies a movement to one warehouse's balance and the product's total in a
// single statement, so the two can never disagree and two people recording
// at once can't both take the last unit. With refuseBelowZero the warehouse
// row only changes if it stays at zero or above; Postgres checks that
// against the locked, current value.
export async function applyMovement(entry: {
  organizationId: string;
  productId: string;
  warehouseId: string;
  quantity: number;
  refuseBelowZero: boolean;
}): Promise<MovementOutcome> {
  const { organizationId, productId, warehouseId, quantity, refuseBelowZero } = entry;

  const result = await db.execute<{
    warehouseStock: number;
    currentStock: number;
    minStock: number;
    name: string;
    sku: string;
  }>(sql`
    WITH ws AS (
      INSERT INTO "product_stock" ("organizationId", "productId", "warehouseId", "quantity")
      SELECT p."organizationId", p."id", ${warehouseId}, ${quantity}
      FROM "products" p
      WHERE p."id" = ${productId}
        AND p."organizationId" = ${organizationId}
        AND (
          NOT ${refuseBelowZero}
          OR ${quantity} >= 0
          OR EXISTS (
            SELECT 1 FROM "product_stock"
            WHERE "productId" = ${productId} AND "warehouseId" = ${warehouseId}
          )
        )
      ON CONFLICT ("productId", "warehouseId") DO UPDATE
        SET "quantity" = "product_stock"."quantity" + EXCLUDED."quantity", "updatedAt" = now()
        WHERE NOT ${refuseBelowZero} OR "product_stock"."quantity" + EXCLUDED."quantity" >= 0
      RETURNING "quantity"
    ),
    p AS (
      UPDATE "products"
      SET "currentStock" = "currentStock" + ${quantity}, "updatedAt" = now()
      WHERE "id" = ${productId}
        AND "organizationId" = ${organizationId}
        AND EXISTS (SELECT 1 FROM ws)
      RETURNING "currentStock", "minStock", "name", "sku"
    )
    SELECT ws."quantity" AS "warehouseStock", p."currentStock", p."minStock", p."name", p."sku"
    FROM ws, p
  `);

  const [row] = result.rows;

  if (row) {
    return {
      status: "ok",
      warehouseStock: Number(row.warehouseStock),
      product: {
        currentStock: Number(row.currentStock),
        minStock: Number(row.minStock),
        name: row.name,
        sku: row.sku,
      },
    };
  }

  const [exists] = await db
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.id, productId), eq(products.organizationId, organizationId)))
    .limit(1);

  if (!exists) return { status: "not_found" };

  const [held] = await db
    .select({ quantity: productStock.quantity })
    .from(productStock)
    .where(and(eq(productStock.productId, productId), eq(productStock.warehouseId, warehouseId)))
    .limit(1);

  return { status: "insufficient", available: held?.quantity ?? 0 };
}

export type WarehouseQuantity = { warehouseId: string; quantity: number };

export async function getStockByProduct(organizationId: string, productIds?: string[]) {
  if (productIds && productIds.length === 0) return new Map<string, WarehouseQuantity[]>();

  const conditions = [eq(productStock.organizationId, organizationId), ne(productStock.quantity, 0)];
  if (productIds) conditions.push(inArray(productStock.productId, productIds));

  const rows = await db
    .select({
      productId: productStock.productId,
      warehouseId: productStock.warehouseId,
      quantity: productStock.quantity,
    })
    .from(productStock)
    .where(and(...conditions));

  const byProduct = new Map<string, WarehouseQuantity[]>();
  for (const row of rows) {
    const list = byProduct.get(row.productId) ?? [];
    list.push({ warehouseId: row.warehouseId, quantity: row.quantity });
    byProduct.set(row.productId, list);
  }
  return byProduct;
}

// Adds `stockByWarehouse` (only warehouses holding a non-zero quantity) to
// product rows.
export async function withWarehouseStock<T extends { id: string }>(
  organizationId: string,
  rows: T[],
): Promise<(T & { stockByWarehouse: WarehouseQuantity[] })[]> {
  const byProduct = await getStockByProduct(
    organizationId,
    rows.map((row) => row.id),
  );
  return rows.map((row) => ({ ...row, stockByWarehouse: byProduct.get(row.id) ?? [] }));
}

export type WarehouseStockSummary = {
  units: number;
  products: number;
  valueAtCost: number;
  valueAtRetail: number;
};

export async function getWarehouseSummaries(organizationId: string) {
  const rows = await db
    .select({
      warehouseId: productStock.warehouseId,
      units: sql<number>`coalesce(sum(${productStock.quantity}), 0)::int`,
      products: sql<number>`count(*) filter (where ${productStock.quantity} <> 0)::int`,
      valueAtCost: sql<number>`coalesce(sum(${productStock.quantity} * ${products.purchasePrice}), 0)::float8`,
      valueAtRetail: sql<number>`coalesce(sum(${productStock.quantity} * ${products.sellingPrice}), 0)::float8`,
    })
    .from(productStock)
    .innerJoin(products, eq(productStock.productId, products.id))
    .where(eq(productStock.organizationId, organizationId))
    .groupBy(productStock.warehouseId);

  return new Map<string, WarehouseStockSummary>(
    rows.map((row) => [
      row.warehouseId,
      {
        units: Number(row.units),
        products: Number(row.products),
        valueAtCost: Number(row.valueAtCost),
        valueAtRetail: Number(row.valueAtRetail),
      },
    ]),
  );
}

const EMPTY_SUMMARY: WarehouseStockSummary = { units: 0, products: 0, valueAtCost: 0, valueAtRetail: 0 };

export function summaryFor(summaries: Map<string, WarehouseStockSummary>, warehouseId: string) {
  return summaries.get(warehouseId) ?? EMPTY_SUMMARY;
}

// What a warehouse still holds, largest first, for refusing to disable it.
export async function getHeldStock(organizationId: string, warehouseId: string) {
  return db
    .select({ name: products.name, sku: products.sku, quantity: productStock.quantity })
    .from(productStock)
    .innerJoin(products, eq(productStock.productId, products.id))
    .where(
      and(
        eq(productStock.organizationId, organizationId),
        eq(productStock.warehouseId, warehouseId),
        ne(productStock.quantity, 0),
      ),
    )
    .orderBy(sql`abs(${productStock.quantity}) desc`);
}
