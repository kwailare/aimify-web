import { and, desc, eq, gt, gte, isNotNull, lt, notInArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  creditEntries,
  customers,
  expenseCategories,
  expenses,
  productStock,
  products,
  purchases,
  saleLines,
  sales,
  suppliers,
  warehouses,
} from "@/db/schema";
import { roundMoney } from "@/lib/credit";
import type { Permission } from "@/lib/permissions";
import { getPermissionsFor } from "@/lib/role-permissions";

// The business at a glance for a period, with the same figures for an
// earlier period to compare against. Each section is only worked out (and
// returned) for someone who may see that module.
//
// Sales are counted at their total (what customers paid or owe, tax
// included). Profit leaves tax out: gross profit = sales before tax, after
// discounts, minus what the goods sold cost (each line's cost when it was
// sold); net profit = gross profit minus expenses. Voided sales, cancelled
// and draft purchases, and voided expenses don't count.

export type Range = { from: Date; to: Date };
export type Bucket = "day" | "month";

const pct = (value: number, base: number) => (base > 0 ? roundMoney((value / base) * 100) : null);

export async function businessSummary(params: {
  organizationId: string;
  permissions: ReadonlySet<Permission>;
  range: Range;
  compare: Range;
  bucket: Bucket;
  // Minutes to add to UTC for the business's local time (Lagos: 60), so
  // days and months start at local midnight.
  tzMinutes: number;
}) {
  const { organizationId: org, permissions: can, range, compare, bucket, tzMinutes } = params;
  const offset = sql.raw(`interval '${Math.trunc(tzMinutes)} minutes'`);
  const bucketOf = (column: unknown) =>
    sql<string>`to_char(date_trunc(${sql.raw(`'${bucket}'`)}, ${column} + ${offset}), 'YYYY-MM-DD')`;
  const result: Record<string, unknown> = {
    range,
    compare,
    bucket,
  };

  const salesIn = (r: Range) =>
    and(eq(sales.organizationId, org), eq(sales.status, "completed"), gte(sales.saleDate, r.from), lt(sales.saleDate, r.to));
  const purchasesIn = (r: Range) =>
    and(
      eq(purchases.organizationId, org),
      notInArray(purchases.status, ["draft", "cancelled"]),
      gte(purchases.orderDate, r.from),
      lt(purchases.orderDate, r.to),
    );
  const expensesIn = (r: Range) =>
    and(eq(expenses.organizationId, org), eq(expenses.status, "recorded"), gte(expenses.expenseDate, r.from), lt(expenses.expenseDate, r.to));

  async function salesTotals(r: Range) {
    const [[s], [c]] = await Promise.all([
      db
        .select({
          total: sql<number>`coalesce(sum(${sales.total}), 0)::float8`,
          revenue: sql<number>`coalesce(sum(${sales.subtotal} - ${sales.discount}), 0)::float8`,
          count: sql<number>`count(*)::int`,
        })
        .from(sales)
        .where(salesIn(r)),
      db
        .select({ cogs: sql<number>`coalesce(sum(${saleLines.quantity} * ${saleLines.unitCost}), 0)::float8` })
        .from(saleLines)
        .innerJoin(sales, eq(sales.id, saleLines.saleId))
        .where(salesIn(r)),
    ]);
    const gross = s.revenue - c.cogs;
    return {
      total: roundMoney(s.total),
      count: s.count,
      revenue: roundMoney(s.revenue),
      cogs: roundMoney(c.cogs),
      grossProfit: roundMoney(gross),
      margin: pct(gross, s.revenue),
    };
  }

  const tasks: Promise<void>[] = [];
  let gross: { now: number; before: number } | null = null;
  let spent: { now: number; before: number } | null = null;

  if (can.has("sales.view")) {
    tasks.push(
      (async () => {
        const [now, before, trendSales, trendCogs, top, topCustomers, byWarehouse] = await Promise.all([
          salesTotals(range),
          salesTotals(compare),
          db
            .select({
              bucket: bucketOf(sales.saleDate),
              total: sql<number>`sum(${sales.total})::float8`,
              revenue: sql<number>`sum(${sales.subtotal} - ${sales.discount})::float8`,
            })
            .from(sales)
            .where(salesIn(range))
            .groupBy(sql`1`),
          db
            .select({
              bucket: bucketOf(sales.saleDate),
              cogs: sql<number>`sum(${saleLines.quantity} * ${saleLines.unitCost})::float8`,
            })
            .from(saleLines)
            .innerJoin(sales, eq(sales.id, saleLines.saleId))
            .where(salesIn(range))
            .groupBy(sql`1`),
          db
            .select({
              productId: saleLines.productId,
              name: products.name,
              sku: products.sku,
              unit: products.unit,
              units: sql<number>`sum(${saleLines.quantity})::int`,
              revenue: sql<number>`sum(${saleLines.quantity} * ${saleLines.unitPrice})::float8`,
              cogs: sql<number>`sum(${saleLines.quantity} * ${saleLines.unitCost})::float8`,
            })
            .from(saleLines)
            .innerJoin(sales, eq(sales.id, saleLines.saleId))
            .innerJoin(products, eq(products.id, saleLines.productId))
            .where(salesIn(range))
            .groupBy(saleLines.productId, products.name, products.sku, products.unit)
            .orderBy(desc(sql`sum(${saleLines.quantity} * ${saleLines.unitPrice})`))
            .limit(5),
          db
            .select({
              customerId: sales.customerId,
              name: customers.name,
              total: sql<number>`sum(${sales.total})::float8`,
              count: sql<number>`count(*)::int`,
            })
            .from(sales)
            .innerJoin(customers, eq(customers.id, sales.customerId))
            .where(and(salesIn(range), isNotNull(sales.customerId)))
            .groupBy(sales.customerId, customers.name)
            .orderBy(desc(sql`sum(${sales.total})`))
            .limit(5),
          db
            .select({
              warehouseId: sales.warehouseId,
              name: warehouses.name,
              total: sql<number>`sum(${sales.total})::float8`,
              count: sql<number>`count(*)::int`,
            })
            .from(sales)
            .innerJoin(warehouses, eq(warehouses.id, sales.warehouseId))
            .where(salesIn(range))
            .groupBy(sales.warehouseId, warehouses.name),
        ]);
        const cogsByBucket = new Map(trendCogs.map((t) => [t.bucket, t.cogs]));
        gross = { now: now.grossProfit, before: before.grossProfit };
        result.sales = {
          ...now,
          previous: { total: before.total, count: before.count, grossProfit: before.grossProfit },
          change: pct(now.total - before.total, before.total),
          grossProfitChange: before.grossProfit > 0 ? pct(now.grossProfit - before.grossProfit, before.grossProfit) : null,
          trend: trendSales
            .map((t) => ({
              bucket: t.bucket,
              sales: roundMoney(t.total),
              grossProfit: roundMoney(t.revenue - (cogsByBucket.get(t.bucket) ?? 0)),
            }))
            .sort((a, b) => a.bucket.localeCompare(b.bucket)),
          topProducts: top
            .map((p) => ({
              productId: p.productId,
              name: p.name,
              sku: p.sku,
              unit: p.unit,
              units: p.units,
              revenue: roundMoney(p.revenue),
              grossProfit: roundMoney(p.revenue - p.cogs),
            }))
            .sort((a, b) => b.revenue - a.revenue),
          topCustomers: topCustomers.map((c) => ({
            customerId: c.customerId,
            name: c.name,
            total: roundMoney(c.total),
            count: c.count,
          })),
          byWarehouse: byWarehouse
            .map((w) => ({ warehouseId: w.warehouseId, name: w.name, total: roundMoney(w.total), count: w.count }))
            .sort((a, b) => b.total - a.total),
        };
      })(),
    );
  }

  if (can.has("purchases.view")) {
    tasks.push(
      (async () => {
        const totals = (r: Range) =>
          db
            .select({ total: sql<number>`coalesce(sum(${purchases.total}), 0)::float8`, count: sql<number>`count(*)::int` })
            .from(purchases)
            .where(purchasesIn(r));
        const [[now], [before], trend] = await Promise.all([
          totals(range),
          totals(compare),
          db
            .select({ bucket: bucketOf(purchases.orderDate), total: sql<number>`sum(${purchases.total})::float8` })
            .from(purchases)
            .where(purchasesIn(range))
            .groupBy(sql`1`),
        ]);
        result.purchases = {
          total: roundMoney(now.total),
          count: now.count,
          previous: { total: roundMoney(before.total) },
          change: pct(now.total - before.total, before.total),
          trend: trend.map((t) => ({ bucket: t.bucket, total: roundMoney(t.total) })).sort((a, b) => a.bucket.localeCompare(b.bucket)),
        };
      })(),
    );
  }

  if (can.has("expenses.view")) {
    tasks.push(
      (async () => {
        const totals = (r: Range) =>
          db
            .select({ total: sql<number>`coalesce(sum(${expenses.amount}), 0)::float8`, count: sql<number>`count(*)::int` })
            .from(expenses)
            .where(expensesIn(r));
        const [[now], [before], trend, byCategory] = await Promise.all([
          totals(range),
          totals(compare),
          db
            .select({ bucket: bucketOf(expenses.expenseDate), total: sql<number>`sum(${expenses.amount})::float8` })
            .from(expenses)
            .where(expensesIn(range))
            .groupBy(sql`1`),
          db
            .select({ name: expenseCategories.name, total: sql<number>`sum(${expenses.amount})::float8` })
            .from(expenses)
            .innerJoin(expenseCategories, eq(expenseCategories.id, expenses.categoryId))
            .where(expensesIn(range))
            .groupBy(expenseCategories.name),
        ]);
        spent = { now: now.total, before: before.total };
        result.expenses = {
          total: roundMoney(now.total),
          count: now.count,
          previous: { total: roundMoney(before.total) },
          change: pct(now.total - before.total, before.total),
          trend: trend.map((t) => ({ bucket: t.bucket, total: roundMoney(t.total) })).sort((a, b) => a.bucket.localeCompare(b.bucket)),
          byCategory: byCategory.map((c) => ({ name: c.name, total: roundMoney(c.total) })).sort((a, b) => b.total - a.total),
        };
      })(),
    );
  }

  const owing = (type: "customer" | "supplier") => {
    const table = type === "customer" ? customers : suppliers;
    return Promise.all([
      db
        .select({
          owed: sql<number>`coalesce(sum(greatest(${table.balance}, 0)), 0)::float8`,
          parties: sql<number>`count(*) filter (where ${table.balance} > 0)::int`,
        })
        .from(table)
        .where(eq(table.organizationId, org)),
      db
        .select({ overdue: sql<number>`coalesce(sum(${creditEntries.openAmount}), 0)::float8` })
        .from(creditEntries)
        .where(
          and(
            eq(creditEntries.organizationId, org),
            eq(creditEntries.partyType, type),
            gt(creditEntries.openAmount, 0),
            lt(creditEntries.dueDate, new Date()),
          ),
        ),
    ]).then(([[o], [d]]) => ({ owed: roundMoney(o.owed), overdue: roundMoney(d.overdue), parties: o.parties }));
  };
  if (can.has("customers.view")) {
    tasks.push(owing("customer").then((r) => void (result.receivables = r)));
  }
  if (can.has("suppliers.view")) {
    tasks.push(owing("supplier").then((r) => void (result.payables = r)));
  }

  if (can.has("products.view")) {
    tasks.push(
      (async () => {
        const [[totals], byWarehouse] = await Promise.all([
          db
            .select({
              valueAtCost: sql<number>`coalesce(sum(${products.currentStock} * ${products.purchasePrice}), 0)::float8`,
              valueAtRetail: sql<number>`coalesce(sum(${products.currentStock} * ${products.sellingPrice}), 0)::float8`,
              lowStock: sql<number>`count(*) filter (where ${products.minStock} > 0 and ${products.currentStock} > 0 and ${products.currentStock} <= ${products.minStock})::int`,
              outOfStock: sql<number>`count(*) filter (where ${products.currentStock} <= 0)::int`,
            })
            .from(products)
            .where(and(eq(products.organizationId, org), eq(products.status, "active"))),
          db
            .select({
              warehouseId: productStock.warehouseId,
              name: warehouses.name,
              units: sql<number>`coalesce(sum(${productStock.quantity}), 0)::int`,
              valueAtCost: sql<number>`coalesce(sum(${productStock.quantity} * ${products.purchasePrice}), 0)::float8`,
            })
            .from(productStock)
            .innerJoin(products, eq(products.id, productStock.productId))
            .innerJoin(warehouses, eq(warehouses.id, productStock.warehouseId))
            .where(and(eq(productStock.organizationId, org), eq(products.status, "active")))
            .groupBy(productStock.warehouseId, warehouses.name),
        ]);
        result.stock = {
          valueAtCost: roundMoney(totals.valueAtCost),
          valueAtRetail: roundMoney(totals.valueAtRetail),
          lowStock: totals.lowStock,
          outOfStock: totals.outOfStock,
          byWarehouse: byWarehouse
            .map((w) => ({ warehouseId: w.warehouseId, name: w.name, units: w.units, valueAtCost: roundMoney(w.valueAtCost) }))
            .sort((a, b) => b.valueAtCost - a.valueAtCost),
        };
      })(),
    );
  }

  await Promise.all(tasks);

  if (gross && spent) {
    const g = gross as { now: number; before: number };
    const e = spent as { now: number; before: number };
    const now = roundMoney(g.now - e.now);
    const before = roundMoney(g.before - e.before);
    result.netProfit = { value: now, previous: before, change: before > 0 ? pct(now - before, before) : null };
  }
  return result;
}

/** The website's summary: this month so far (Lagos time) against last month, for [role]. */
export async function thisMonthSummary(organizationId: string, role: string) {
  const tz = 60;
  const local = new Date(Date.now() + tz * 60_000);
  const monthStart = (offset: number) =>
    new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + offset, 1) - tz * 60_000);
  const summary = (await businessSummary({
    organizationId,
    permissions: await getPermissionsFor(organizationId, role),
    range: { from: monthStart(0), to: monthStart(1) },
    compare: { from: monthStart(-1), to: monthStart(0) },
    bucket: "month",
    tzMinutes: tz,
  })) as {
    sales?: { total: number; count: number; grossProfit: number; margin: number | null; change: number | null };
    expenses?: { total: number; change: number | null };
    netProfit?: { value: number; change: number | null };
    receivables?: { owed: number; overdue: number; parties: number };
    payables?: { owed: number; overdue: number };
  };
  return { summary, monthName: local.toLocaleString("en-US", { month: "long", timeZone: "UTC" }) };
}
