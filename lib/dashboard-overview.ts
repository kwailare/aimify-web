import { and, count, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  memberships,
  products,
  stockMovements,
  users,
  warehouses,
} from "@/db/schema";
import { getRecentAuditLogs } from "@/lib/audit";
import { getStockAlerts } from "@/lib/stock-alerts";

const DAY = 24 * 60 * 60 * 1000;
const TREND_DAYS = 14;

function dayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

export async function getDashboardOverview(organizationId: string) {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * DAY);
  const trendStart = new Date(now.getTime() - (TREND_DAYS - 1) * DAY);
  trendStart.setUTCHours(0, 0, 0, 0);

  const activeProducts = and(
    eq(products.organizationId, organizationId),
    eq(products.status, "active"),
  );

  const [
    [productTotals],
    [archivedTotal],
    [warehouseTotals],
    [memberTotal],
    [movementsWeek],
    [movementsTotal],
    [lastMovement],
    alerts,
    topProducts,
    categoryRows,
    recentMovements,
    trendRows,
    recentActivity,
  ] = await Promise.all([
    db
      .select({
        products: count(),
        units: sql<number>`coalesce(sum(${products.currentStock}), 0)::int`,
        costValue: sql<number>`coalesce(sum(${products.currentStock} * ${products.purchasePrice}), 0)::float8`,
        retailValue: sql<number>`coalesce(sum(${products.currentStock} * ${products.sellingPrice}), 0)::float8`,
      })
      .from(products)
      .where(activeProducts),
    db
      .select({ value: count() })
      .from(products)
      .where(
        and(
          eq(products.organizationId, organizationId),
          eq(products.status, "archived"),
        ),
      ),
    db
      .select({
        total: count(),
        active: sql<number>`count(*) filter (where ${warehouses.status} = 'active')::int`,
      })
      .from(warehouses)
      .where(eq(warehouses.organizationId, organizationId)),
    db
      .select({ value: count() })
      .from(memberships)
      .where(eq(memberships.organizationId, organizationId)),
    db
      .select({ value: count() })
      .from(stockMovements)
      .where(
        and(
          eq(stockMovements.organizationId, organizationId),
          gte(stockMovements.createdAt, weekAgo),
        ),
      ),
    db
      .select({ value: count() })
      .from(stockMovements)
      .where(eq(stockMovements.organizationId, organizationId)),
    db
      .select({
        at: sql<Date | null>`max(${stockMovements.createdAt})`.mapWith(
          stockMovements.createdAt,
        ),
      })
      .from(stockMovements)
      .where(eq(stockMovements.organizationId, organizationId)),
    getStockAlerts(organizationId),
    db
      .select({
        id: products.id,
        name: products.name,
        sku: products.sku,
        unit: products.unit,
        currentStock: products.currentStock,
        value: sql<number>`(${products.currentStock} * ${products.sellingPrice})::float8`,
      })
      .from(products)
      .where(activeProducts)
      .orderBy(desc(sql`${products.currentStock} * ${products.sellingPrice}`))
      .limit(5),
    db
      .select({
        category: sql<string>`coalesce(nullif(${products.category}, ''), 'Uncategorised')`,
        products: count(),
      })
      .from(products)
      .where(activeProducts)
      .groupBy(sql`coalesce(nullif(${products.category}, ''), 'Uncategorised')`)
      .orderBy(desc(count()))
      .limit(6),
    db
      .select({
        id: stockMovements.id,
        type: stockMovements.type,
        quantity: stockMovements.quantity,
        newStock: stockMovements.newStock,
        createdAt: stockMovements.createdAt,
        productName: products.name,
        unit: products.unit,
        userName: users.name,
      })
      .from(stockMovements)
      .innerJoin(products, eq(stockMovements.productId, products.id))
      .leftJoin(users, eq(stockMovements.userId, users.id))
      .where(eq(stockMovements.organizationId, organizationId))
      .orderBy(desc(stockMovements.createdAt))
      .limit(6),
    db
      .select({
        createdAt: stockMovements.createdAt,
        quantity: stockMovements.quantity,
      })
      .from(stockMovements)
      .where(
        and(
          eq(stockMovements.organizationId, organizationId),
          gte(stockMovements.createdAt, trendStart),
        ),
      ),
    getRecentAuditLogs(organizationId, 6),
  ]);

  const trend: { key: string; incoming: number; outgoing: number }[] = [];
  const trendIndex = new Map<string, number>();

  for (let i = 0; i < TREND_DAYS; i++) {
    const key = dayKey(new Date(trendStart.getTime() + i * DAY));
    trendIndex.set(key, trend.length);
    trend.push({ key, incoming: 0, outgoing: 0 });
  }

  for (const row of trendRows) {
    const i = trendIndex.get(dayKey(row.createdAt));

    if (i === undefined) continue;

    if (row.quantity > 0) trend[i].incoming += row.quantity;
    else trend[i].outgoing += Math.abs(row.quantity);
  }

  return {
    products: productTotals.products,
    archivedProducts: archivedTotal.value,
    unitsInStock: productTotals.units,
    costValue: productTotals.costValue,
    retailValue: productTotals.retailValue,
    warehouses: warehouseTotals.total,
    activeWarehouses: warehouseTotals.active,
    members: memberTotal.value,
    movementsWeek: movementsWeek.value,
    movementsTotal: movementsTotal.value,
    lastMovementAt: lastMovement?.at ?? null,
    lowStock: alerts.lowStock.slice(0, 5),
    lowStockCount: alerts.lowStock.length,
    outOfStock: alerts.outOfStock.slice(0, 5),
    outOfStockCount: alerts.outOfStock.length,
    topProducts,
    categories: categoryRows,
    recentMovements,
    trend,
    recentActivity,
  };
}
