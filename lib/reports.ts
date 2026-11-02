import { NextResponse } from "next/server";
import { type SQL, sql } from "drizzle-orm";
import { db } from "@/db";
import { roundMoney } from "@/lib/credit";
import { isUuid } from "@/lib/validation";

// Shared by the reports under /api/v1/reports: reading the period, time zone
// and filters, and running the grouped queries.

export type ReportBucket = "day" | "month";

export type ReportParams = {
  from: Date;
  to: Date;
  // Minutes to add to UTC for local time (Lagos: 60).
  tz: number;
  bucket: ReportBucket;
  filters: Record<string, string | undefined>;
};

// A filter is an id, or one of a few fixed values (or an id or "walk-in").
export type FilterSpec = "uuid" | readonly string[] | { uuidOr: readonly string[] };

const MAX_DAYS = 732;
const DAY = 86_400_000;

const bad = (error: string) => NextResponse.json({ error }, { status: 400 });

/**
 * from (inclusive) and to (exclusive) instants, default this month (local);
 * tz (default 60); bucket (day | month; default day for up to 62 days); and
 * the [filters] named, each checked against its spec.
 */
export function readReportParams(url: string, filters: Record<string, FilterSpec>): ReportParams | NextResponse {
  const params = new URL(url).searchParams;
  const tz = params.get("tz") === null ? 60 : Number(params.get("tz"));
  if (!Number.isInteger(tz) || tz < -720 || tz > 840) return bad("tz must be whole minutes between -720 and 840.");

  const read = (key: string) => {
    const value = params.get(key);
    if (value === null) return undefined;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };
  let from = read("from");
  let to = read("to");
  if (from === null || to === null) return bad("from and to must be dates.");
  if (!from || !to) {
    const local = new Date(Date.now() + tz * 60_000);
    const start = (m: number) => new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + m, 1) - tz * 60_000);
    from ??= start(0);
    to ??= start(1);
  }
  if (to <= from || to.getTime() - from.getTime() > MAX_DAYS * DAY) {
    return bad(`The period must end after it starts and be at most ${MAX_DAYS} days.`);
  }

  const bucketParam = params.get("bucket");
  if (bucketParam !== null && bucketParam !== "day" && bucketParam !== "month") return bad("bucket must be day or month.");
  const bucket: ReportBucket =
    (bucketParam as ReportBucket | null) ?? (to.getTime() - from.getTime() > 62 * DAY ? "month" : "day");

  const values: Record<string, string | undefined> = {};
  for (const [name, spec] of Object.entries(filters)) {
    const value = params.get(name) || undefined;
    if (value !== undefined) {
      const ok =
        spec === "uuid"
          ? isUuid(value)
          : Array.isArray(spec)
            ? spec.includes(value)
            : isUuid(value) || (spec as { uuidOr: readonly string[] }).uuidOr.includes(value);
      if (!ok) {
        const allowed =
          spec === "uuid" ? "an id" : Array.isArray(spec) ? spec.join(", ") : `an id or ${(spec as { uuidOr: readonly string[] }).uuidOr.join(", ")}`;
        return bad(`${name} must be ${allowed}.`);
      }
    }
    values[name] = value;
  }
  return { from, to, tz, bucket, filters: values };
}

export const at = (d: Date) => sql`${d.toISOString()}::timestamp`;

/** The day or month (local) a timestamp column falls in, as YYYY-MM-DD. */
export const bucketOf = (column: SQL, p: Pick<ReportParams, "bucket" | "tz">) =>
  sql`to_char(date_trunc(${sql.raw(`'${p.bucket}'`)}, ${column} + ${sql.raw(`interval '${Math.trunc(p.tz)} minutes'`)}), 'YYYY-MM-DD')`;

export async function rows<T>(query: SQL): Promise<T[]> {
  return (await db.execute(query)).rows as T[];
}

export const and = (conditions: (SQL | false | "" | undefined)[]) =>
  sql.join(
    conditions.filter((c): c is SQL => !!c),
    sql` and `,
  );

export const money = (n: number | null | undefined) => roundMoney(Number(n ?? 0));
export const pct = (value: number, base: number) => (base > 0 ? roundMoney((value / base) * 100) : null);

/** Names of the organization's current members, for a staff filter. */
export async function people(organizationId: string) {
  return rows<{ id: string; name: string }>(sql`
    select u.id, u.name from memberships m join users u on u.id = m."userId"
    where m."organizationId" = ${organizationId} order by u.name`);
}

// ---------------------------------------------------------------- sales

type SalesGroupRow = {
  key: string | null;
  name: string | null;
  count: number;
  total: number;
  paid: number;
  revenue: number;
  units: number;
  line_revenue: number;
  cogs: number;
};

/**
 * Completed sales in the period: totals, by day or month, product, customer,
 * staff member and warehouse, and the sales themselves (newest first, at most
 * 1000). Filters: warehouseId, customerId ("walk-in" for sales without a
 * customer), userId (who made the sale) and productId.
 *
 * Revenue is goods after the sale's discount, before tax; cost is each line's
 * cost when it was sold. With productId, revenue, cost and profit are that
 * product's lines (at their line prices); counts and money taken are the
 * sales that include it.
 */
export async function salesReport(organizationId: string, p: ReportParams) {
  const f = p.filters;
  const where = (status: string) =>
    and([
      sql`s."organizationId" = ${organizationId}`,
      sql`s.status = ${status}`,
      sql`s."saleDate" >= ${at(p.from)}`,
      sql`s."saleDate" < ${at(p.to)}`,
      f.warehouseId && sql`s."warehouseId" = ${f.warehouseId}`,
      f.customerId === "walk-in" && sql`s."customerId" is null`,
      f.customerId && f.customerId !== "walk-in" && sql`s."customerId" = ${f.customerId}`,
      f.userId && sql`s."createdBy" = ${f.userId}`,
      f.productId && sql`exists (select 1 from sale_lines x where x."saleId" = s.id and x."productId" = ${f.productId})`,
    ]);
  const W = where("completed");
  const lineW = f.productId ? sql`${W} and l."productId" = ${f.productId}` : W;
  const byProductFilter = !!f.productId;

  const group = (key: SQL, name: SQL, join: SQL, order: SQL) =>
    rows<SalesGroupRow>(sql`
      with s1 as (
        select ${key} as k, ${name} as name, count(*)::int as count, sum(s.total) as total,
               sum(s."amountPaid") as paid, sum(s.subtotal - s.discount) as revenue
        from sales s ${join} where ${W} group by 1, 2
      ), l1 as (
        select ${key} as k, sum(l.quantity)::int as units, sum(l.quantity * l."unitPrice") as line_revenue,
               sum(l.quantity * l."unitCost") as cogs
        from sale_lines l join sales s on s.id = l."saleId" ${join} where ${lineW} group by 1
      )
      select s1.k::text as key, s1.name, s1.count, s1.total::float8 as total, s1.paid::float8 as paid,
             s1.revenue::float8 as revenue, coalesce(l1.units, 0)::int as units,
             coalesce(l1.line_revenue, 0)::float8 as line_revenue, coalesce(l1.cogs, 0)::float8 as cogs
      from s1 left join l1 on l1.k is not distinct from s1.k
      order by ${order}`);

  const shape = (r: SalesGroupRow) => {
    const revenue = byProductFilter ? r.line_revenue : r.revenue;
    const gross = revenue - r.cogs;
    return {
      count: r.count,
      units: r.units,
      total: money(r.total),
      paid: money(r.paid),
      outstanding: money(r.total - r.paid),
      revenue: money(revenue),
      cogs: money(r.cogs),
      grossProfit: money(gross),
      margin: pct(gross, revenue),
    };
  };

  const none = sql``;
  const [[totals], [lines], [voided], byPeriod, byCustomer, byStaff, byWarehouse, byProduct, list, staff] = await Promise.all([
    rows<{ count: number; subtotal: number; discount: number; tax: number; total: number; paid: number }>(sql`
      select count(*)::int as count, coalesce(sum(subtotal), 0)::float8 as subtotal, coalesce(sum(discount), 0)::float8 as discount,
             coalesce(sum(tax), 0)::float8 as tax, coalesce(sum(total), 0)::float8 as total, coalesce(sum("amountPaid"), 0)::float8 as paid
      from sales s where ${W}`),
    rows<{ units: number; line_revenue: number; cogs: number }>(sql`
      select coalesce(sum(l.quantity), 0)::int as units, coalesce(sum(l.quantity * l."unitPrice"), 0)::float8 as line_revenue,
             coalesce(sum(l.quantity * l."unitCost"), 0)::float8 as cogs
      from sale_lines l join sales s on s.id = l."saleId" where ${lineW}`),
    rows<{ count: number; total: number }>(sql`
      select count(*)::int as count, coalesce(sum(total), 0)::float8 as total from sales s where ${where("voided")}`),
    group(bucketOf(sql`s."saleDate"`, p), sql`''`, none, sql`1`),
    group(sql`s."customerId"`, sql`coalesce(c.name, 'Walk-in')`, sql`left join customers c on c.id = s."customerId"`, sql`4 desc`),
    group(sql`s."createdBy"`, sql`coalesce(u.name, 'Unknown')`, sql`left join users u on u.id = s."createdBy"`, sql`4 desc`),
    group(sql`s."warehouseId"`, sql`w.name`, sql`join warehouses w on w.id = s."warehouseId"`, sql`4 desc`),
    rows<{ product_id: string; name: string; sku: string; unit: string; sales: number; units: number; revenue: number; cogs: number }>(sql`
      select l."productId" as product_id, pr.name, pr.sku, pr.unit, count(distinct s.id)::int as sales,
             sum(l.quantity)::int as units, sum(l.quantity * l."unitPrice")::float8 as revenue,
             sum(l.quantity * l."unitCost")::float8 as cogs
      from sale_lines l join sales s on s.id = l."saleId" join products pr on pr.id = l."productId"
      where ${lineW} group by 1, 2, 3, 4 order by 7 desc`),
    rows<{
      id: string; reference: string; sale_date: string; customer: string; customer_id: string | null; warehouse: string;
      staff: string | null; subtotal: number; discount: number; tax: number; total: number; paid: number;
    }>(sql`
      select s.id, s.reference, s."saleDate" as sale_date, coalesce(c.name, 'Walk-in') as customer, s."customerId" as customer_id,
             w.name as warehouse, u.name as staff, s.subtotal::float8 as subtotal, s.discount::float8 as discount,
             s.tax::float8 as tax, s.total::float8 as total, s."amountPaid"::float8 as paid
      from sales s join warehouses w on w.id = s."warehouseId"
      left join customers c on c.id = s."customerId" left join users u on u.id = s."createdBy"
      where ${W} order by s."saleDate" desc, s.number desc limit 1001`),
    people(organizationId),
  ]);

  const revenue = byProductFilter ? lines.line_revenue : totals.subtotal - totals.discount;
  const gross = revenue - lines.cogs;
  const named = (r: SalesGroupRow, idKey: string) => ({ [idKey]: r.key, name: r.name, ...shape(r) });
  return {
    range: { from: p.from, to: p.to },
    bucket: p.bucket,
    filters: f,
    totals: {
      count: totals.count,
      units: lines.units,
      subtotal: money(totals.subtotal),
      discount: money(totals.discount),
      tax: money(totals.tax),
      total: money(totals.total),
      paid: money(totals.paid),
      outstanding: money(totals.total - totals.paid),
      revenue: money(revenue),
      cogs: money(lines.cogs),
      grossProfit: money(gross),
      margin: pct(gross, revenue),
      averageSale: totals.count ? money(totals.total / totals.count) : 0,
    },
    voided: { count: voided.count, total: money(voided.total) },
    byPeriod: byPeriod.map((r) => ({ bucket: r.key, ...shape(r) })),
    byProduct: byProduct.map((r) => ({
      productId: r.product_id,
      name: r.name,
      sku: r.sku,
      unit: r.unit,
      sales: r.sales,
      units: r.units,
      revenue: money(r.revenue),
      cogs: money(r.cogs),
      grossProfit: money(r.revenue - r.cogs),
      margin: pct(r.revenue - r.cogs, r.revenue),
    })),
    byCustomer: byCustomer.map((r) => named(r, "customerId")),
    byStaff: byStaff.map((r) => named(r, "userId")),
    byWarehouse: byWarehouse.map((r) => named(r, "warehouseId")),
    sales: list.slice(0, 1000).map((r) => ({
      id: r.id,
      reference: r.reference,
      saleDate: r.sale_date,
      customerId: r.customer_id,
      customer: r.customer,
      warehouse: r.warehouse,
      staff: r.staff,
      subtotal: money(r.subtotal),
      discount: money(r.discount),
      tax: money(r.tax),
      total: money(r.total),
      paid: money(r.paid),
      outstanding: money(r.total - r.paid),
    })),
    truncated: list.length > 1000,
    people: staff,
  };
}

// ------------------------------------------------------------ purchases

type PurchaseGroupRow = {
  key: string | null;
  name: string | null;
  count: number;
  total: number;
  paid: number;
  units_ordered: number;
  units_received: number;
  received_value: number;
};

/**
 * Purchases ordered in the period (drafts and cancelled ones left out):
 * totals, by status, day or month, supplier, product and warehouse, and the
 * purchases themselves (newest first, at most 1000). Filters: supplierId,
 * warehouseId and productId (purchases that include it; units and values
 * are that product's lines).
 */
export async function purchasesReport(organizationId: string, p: ReportParams) {
  const f = p.filters;
  const W = and([
    sql`pu."organizationId" = ${organizationId}`,
    sql`pu.status not in ('draft', 'cancelled')`,
    sql`pu."orderDate" >= ${at(p.from)}`,
    sql`pu."orderDate" < ${at(p.to)}`,
    f.supplierId && sql`pu."supplierId" = ${f.supplierId}`,
    f.warehouseId && sql`pu."warehouseId" = ${f.warehouseId}`,
    f.productId && sql`exists (select 1 from purchase_lines x where x."purchaseId" = pu.id and x."productId" = ${f.productId})`,
  ]);
  const lineW = f.productId ? sql`${W} and l."productId" = ${f.productId}` : W;

  const group = (key: SQL, name: SQL, join: SQL, order: SQL) =>
    rows<PurchaseGroupRow>(sql`
      with p1 as (
        select ${key} as k, ${name} as name, count(*)::int as count, sum(pu.total) as total, sum(pu."amountPaid") as paid
        from purchases pu ${join} where ${W} group by 1, 2
      ), l1 as (
        select ${key} as k, sum(l.quantity)::int as units_ordered, sum(l."receivedQuantity")::int as units_received,
               sum(l."receivedQuantity" * l."unitCost") as received_value
        from purchase_lines l join purchases pu on pu.id = l."purchaseId" ${join} where ${lineW} group by 1
      )
      select p1.k::text as key, p1.name, p1.count, p1.total::float8 as total, p1.paid::float8 as paid,
             coalesce(l1.units_ordered, 0)::int as units_ordered, coalesce(l1.units_received, 0)::int as units_received,
             coalesce(l1.received_value, 0)::float8 as received_value
      from p1 left join l1 on l1.k is not distinct from p1.k order by ${order}`);
  const shape = (r: PurchaseGroupRow) => ({
    count: r.count,
    total: money(r.total),
    paid: money(r.paid),
    unpaid: money(r.total - r.paid),
    unitsOrdered: r.units_ordered,
    unitsReceived: r.units_received,
    receivedValue: money(r.received_value),
  });

  const none = sql``;
  const [[totals], [lines], byStatus, byPeriod, bySupplier, byWarehouse, byProduct, list] = await Promise.all([
    rows<{ count: number; subtotal: number; discount: number; tax: number; total: number; paid: number }>(sql`
      select count(*)::int as count, coalesce(sum(subtotal), 0)::float8 as subtotal, coalesce(sum(discount), 0)::float8 as discount,
             coalesce(sum(tax), 0)::float8 as tax, coalesce(sum(total), 0)::float8 as total, coalesce(sum("amountPaid"), 0)::float8 as paid
      from purchases pu where ${W}`),
    rows<{ units_ordered: number; units_received: number; ordered_value: number; received_value: number }>(sql`
      select coalesce(sum(l.quantity), 0)::int as units_ordered, coalesce(sum(l."receivedQuantity"), 0)::int as units_received,
             coalesce(sum(l.quantity * l."unitCost"), 0)::float8 as ordered_value,
             coalesce(sum(l."receivedQuantity" * l."unitCost"), 0)::float8 as received_value
      from purchase_lines l join purchases pu on pu.id = l."purchaseId" where ${lineW}`),
    rows<{ status: string; count: number; total: number }>(sql`
      select pu.status, count(*)::int as count, sum(pu.total)::float8 as total from purchases pu where ${W} group by 1 order by 1`),
    group(bucketOf(sql`pu."orderDate"`, p), sql`''`, none, sql`1`),
    group(sql`pu."supplierId"`, sql`su.name`, sql`join suppliers su on su.id = pu."supplierId"`, sql`4 desc`),
    group(sql`pu."warehouseId"`, sql`w.name`, sql`join warehouses w on w.id = pu."warehouseId"`, sql`4 desc`),
    rows<{
      product_id: string; name: string; sku: string; unit: string; purchases: number; units_ordered: number;
      units_received: number; ordered_value: number; min_cost: number; max_cost: number;
    }>(sql`
      select l."productId" as product_id, pr.name, pr.sku, pr.unit, count(distinct pu.id)::int as purchases,
             sum(l.quantity)::int as units_ordered, sum(l."receivedQuantity")::int as units_received,
             sum(l.quantity * l."unitCost")::float8 as ordered_value,
             min(l."unitCost")::float8 as min_cost, max(l."unitCost")::float8 as max_cost
      from purchase_lines l join purchases pu on pu.id = l."purchaseId" join products pr on pr.id = l."productId"
      where ${lineW} group by 1, 2, 3, 4 order by 8 desc`),
    rows<{
      id: string; reference: string; order_date: string; supplier: string; supplier_id: string; warehouse: string;
      status: string; total: number; paid: number;
    }>(sql`
      select pu.id, pu.reference, pu."orderDate" as order_date, su.name as supplier, pu."supplierId" as supplier_id,
             w.name as warehouse, pu.status, pu.total::float8 as total, pu."amountPaid"::float8 as paid
      from purchases pu join suppliers su on su.id = pu."supplierId" join warehouses w on w.id = pu."warehouseId"
      where ${W} order by pu."orderDate" desc, pu.number desc limit 1001`),
  ]);

  return {
    range: { from: p.from, to: p.to },
    bucket: p.bucket,
    filters: f,
    totals: {
      count: totals.count,
      subtotal: money(totals.subtotal),
      discount: money(totals.discount),
      tax: money(totals.tax),
      total: money(totals.total),
      paid: money(totals.paid),
      unpaid: money(totals.total - totals.paid),
      unitsOrdered: lines.units_ordered,
      unitsReceived: lines.units_received,
      orderedValue: money(lines.ordered_value),
      receivedValue: money(lines.received_value),
    },
    byStatus: byStatus.map((r) => ({ status: r.status, count: r.count, total: money(r.total) })),
    byPeriod: byPeriod.map((r) => ({ bucket: r.key, ...shape(r) })),
    bySupplier: bySupplier.map((r) => ({ supplierId: r.key, name: r.name, ...shape(r) })),
    byWarehouse: byWarehouse.map((r) => ({ warehouseId: r.key, name: r.name, ...shape(r) })),
    byProduct: byProduct.map((r) => ({
      productId: r.product_id,
      name: r.name,
      sku: r.sku,
      unit: r.unit,
      purchases: r.purchases,
      unitsOrdered: r.units_ordered,
      unitsReceived: r.units_received,
      orderedValue: money(r.ordered_value),
      averageCost: r.units_ordered ? money(r.ordered_value / r.units_ordered) : 0,
      minCost: money(r.min_cost),
      maxCost: money(r.max_cost),
    })),
    purchases: list.slice(0, 1000).map((r) => ({
      id: r.id,
      reference: r.reference,
      orderDate: r.order_date,
      supplierId: r.supplier_id,
      supplier: r.supplier,
      warehouse: r.warehouse,
      status: r.status,
      total: money(r.total),
      paid: money(r.paid),
      unpaid: money(r.total - r.paid),
    })),
    truncated: list.length > 1000,
  };
}

// ---------------------------------------------------------- profit & loss

/**
 * The profit and loss statement for the period, by day or month, and the
 * money that came in and went out.
 *
 * Profit: net sales (goods after discounts, before tax) less the cost of the
 * goods sold gives gross profit; less expenses gives net profit. Tax
 * collected is shown apart: it is not the business's income.
 *
 * Money in: what customers paid on sales (at the sale or later) and on their
 * account. Money out: what was paid on purchases, to suppliers on account,
 * and expenses. Payments are dated when they were recorded; the part of an
 * account payment that settles an older sale is not counted twice.
 *
 * Filter warehouseId: that warehouse's sales, purchases and expenses;
 * account payments (not tied to a warehouse) are then left out.
 */
export async function profitLossReport(organizationId: string, p: ReportParams) {
  const w = p.filters.warehouseId;
  const range = (column: SQL) => sql`${column} >= ${at(p.from)} and ${column} < ${at(p.to)}`;
  const salesW = and([
    sql`s."organizationId" = ${organizationId}`,
    sql`s.status = 'completed'`,
    range(sql`s."saleDate"`),
    w && sql`s."warehouseId" = ${w}`,
  ]);
  const expensesW = and([
    sql`e."organizationId" = ${organizationId}`,
    sql`e.status = 'recorded'`,
    range(sql`e."expenseDate"`),
    w && sql`e."warehouseId" = ${w}`,
  ]);
  const b = (column: SQL) => bucketOf(column, p);

  type Flow = { bucket: string; source: string; method: string | null; amount: number };
  const accountPayments = w
    ? sql``
    : sql`
      union all
      select ${b(sql`ce."createdAt"`)}, ce."partyType" || '_account', ce.method, sum(-ce.amount)::float8
        from credit_entries ce
        where ce."organizationId" = ${organizationId} and ce.kind = 'payment' and ce."saleId" is null
          and ce."purchaseId" is null and ${range(sql`ce."createdAt"`)}
        group by 1, 2, 3`;
  const [salesByBucket, cogsByBucket, expensesByBucket, byCategory, flows] = await Promise.all([
    rows<{ bucket: string; subtotal: number; discount: number; tax: number; total: number; count: number }>(sql`
      select ${b(sql`s."saleDate"`)} as bucket, sum(s.subtotal)::float8 as subtotal, sum(s.discount)::float8 as discount,
             sum(s.tax)::float8 as tax, sum(s.total)::float8 as total, count(*)::int as count
      from sales s where ${salesW} group by 1 order by 1`),
    rows<{ bucket: string; cogs: number }>(sql`
      select ${b(sql`s."saleDate"`)} as bucket, sum(l.quantity * l."unitCost")::float8 as cogs
      from sale_lines l join sales s on s.id = l."saleId" where ${salesW} group by 1`),
    rows<{ bucket: string; total: number }>(sql`
      select ${b(sql`e."expenseDate"`)} as bucket, sum(e.amount)::float8 as total from expenses e where ${expensesW} group by 1`),
    rows<{ category_id: string; name: string; total: number; count: number }>(sql`
      select e."categoryId" as category_id, c.name, sum(e.amount)::float8 as total, count(*)::int as count
      from expenses e join expense_categories c on c.id = e."categoryId" where ${expensesW} group by 1, 2 order by 3 desc`),
    rows<Flow>(sql`
      select ${b(sql`sp."createdAt"`)} as bucket, 'sales' as source, sp.method, sum(sp.amount)::float8 as amount
        from sale_payments sp join sales s on s.id = sp."saleId"
        where sp."organizationId" = ${organizationId} and sp."creditEntryId" is null and ${range(sql`sp."createdAt"`)}
          ${w ? sql`and s."warehouseId" = ${w}` : sql``}
        group by 1, 2, 3
      union all
      select ${b(sql`pp."createdAt"`)}, 'purchases', null, sum(pp.amount)::float8
        from purchase_payments pp join purchases pu on pu.id = pp."purchaseId"
        where pp."organizationId" = ${organizationId} and pp."creditEntryId" is null and ${range(sql`pp."createdAt"`)}
          ${w ? sql`and pu."warehouseId" = ${w}` : sql``}
        group by 1, 2, 3
      union all
      select ${b(sql`e."expenseDate"`)}, 'expenses', e."paymentMethod", sum(e.amount)::float8
        from expenses e where ${expensesW} group by 1, 2, 3
      ${accountPayments}`),
  ]);

  const sum = <T>(list: T[], get: (x: T) => number) => list.reduce((acc, x) => acc + Number(get(x) ?? 0), 0);
  const grossSales = sum(salesByBucket, (x) => x.subtotal);
  const discounts = sum(salesByBucket, (x) => x.discount);
  const netSales = grossSales - discounts;
  const cogs = sum(cogsByBucket, (x) => x.cogs);
  const spent = sum(expensesByBucket, (x) => x.total);
  const gross = netSales - cogs;
  const net = gross - spent;
  const isIn = (source: string) => source === "sales" || source === "customer_account";

  const buckets = [
    ...new Set([...salesByBucket.map((x) => x.bucket), ...expensesByBucket.map((x) => x.bucket), ...flows.map((x) => x.bucket)]),
  ].sort();
  const byPeriod = buckets.map((bucket) => {
    const s = salesByBucket.find((x) => x.bucket === bucket);
    const sales = s ? s.subtotal - s.discount : 0;
    const c = cogsByBucket.find((x) => x.bucket === bucket)?.cogs ?? 0;
    const e = expensesByBucket.find((x) => x.bucket === bucket)?.total ?? 0;
    const here = flows.filter((x) => x.bucket === bucket);
    return {
      bucket,
      netSales: money(sales),
      cogs: money(c),
      grossProfit: money(sales - c),
      expenses: money(e),
      netProfit: money(sales - c - e),
      moneyIn: money(sum(here.filter((x) => isIn(x.source)), (x) => x.amount)),
      moneyOut: money(sum(here.filter((x) => !isIn(x.source)), (x) => x.amount)),
    };
  });

  const bySource = (source: string) => money(sum(flows.filter((x) => x.source === source), (x) => x.amount));
  const byMethod = () => {
    const totals = new Map<string, number>();
    for (const x of flows.filter((x) => isIn(x.source))) {
      const key = x.method ?? "unspecified";
      totals.set(key, (totals.get(key) ?? 0) + Number(x.amount));
    }
    return [...totals].map(([method, total]) => ({ method, total: money(total) })).sort((a, b) => b.total - a.total);
  };
  const moneyIn = bySource("sales") + bySource("customer_account");
  const moneyOut = bySource("purchases") + bySource("supplier_account") + bySource("expenses");

  return {
    range: { from: p.from, to: p.to },
    bucket: p.bucket,
    filters: p.filters,
    profit: {
      salesCount: sum(salesByBucket, (x) => x.count),
      grossSales: money(grossSales),
      discounts: money(discounts),
      netSales: money(netSales),
      cogs: money(cogs),
      grossProfit: money(gross),
      grossMargin: pct(gross, netSales),
      expenses: money(spent),
      expensesByCategory: byCategory.map((x) => ({ categoryId: x.category_id, name: x.name, total: money(x.total), count: x.count })),
      netProfit: money(net),
      netMargin: pct(net, netSales),
      taxCollected: money(sum(salesByBucket, (x) => x.tax)),
    },
    cash: {
      in: {
        sales: bySource("sales"),
        customerAccounts: bySource("customer_account"),
        total: money(moneyIn),
        byMethod: byMethod(),
      },
      out: {
        purchases: bySource("purchases"),
        supplierAccounts: bySource("supplier_account"),
        expenses: bySource("expenses"),
        total: money(moneyOut),
      },
      net: money(moneyIn - moneyOut),
    },
    byPeriod,
  };
}

// --------------------------------------------------------- stock history

export const MOVEMENT_TYPES = ["stock_in", "stock_out", "adjustment", "count"] as const;
export const MOVEMENT_SOURCES = ["manual", "sale", "purchase"] as const;

/**
 * Stock movements in the period: totals in and out, by type, product and
 * person, and the movements themselves (newest first, at most 2000) with who
 * made them and the sale or purchase behind them. Filters: warehouseId,
 * productId, userId, type and source (manual, sale or purchase).
 */
export async function stockMovementsReport(organizationId: string, p: ReportParams) {
  const f = p.filters;
  const W = and([
    sql`m."organizationId" = ${organizationId}`,
    sql`m."createdAt" >= ${at(p.from)}`,
    sql`m."createdAt" < ${at(p.to)}`,
    f.warehouseId && sql`m."warehouseId" = ${f.warehouseId}`,
    f.productId && sql`m."productId" = ${f.productId}`,
    f.userId && sql`m."userId" = ${f.userId}`,
    f.type && sql`m.type = ${f.type}`,
    f.source === "sale" && sql`m."saleId" is not null`,
    f.source === "purchase" && sql`m."purchaseId" is not null`,
    f.source === "manual" && sql`m."saleId" is null and m."purchaseId" is null`,
  ]);
  const inOut = sql`count(*)::int as count,
    coalesce(sum(greatest(m.quantity, 0)), 0)::int as units_in, coalesce(sum(greatest(-m.quantity, 0)), 0)::int as units_out`;

  type InOut = { count: number; units_in: number; units_out: number };
  const [[totals], byType, byProduct, byUser, list, staff] = await Promise.all([
    rows<InOut>(sql`select ${inOut} from stock_movements m where ${W}`),
    rows<InOut & { type: string }>(sql`select m.type, ${inOut} from stock_movements m where ${W} group by 1 order by 1`),
    rows<InOut & { product_id: string; name: string; sku: string; unit: string; cost: number }>(sql`
      select m."productId" as product_id, pr.name, pr.sku, pr.unit, pr."purchasePrice"::float8 as cost, ${inOut}
      from stock_movements m join products pr on pr.id = m."productId" where ${W} group by 1, 2, 3, 4, 5 order by 2`),
    rows<InOut & { user_id: string | null; name: string | null }>(sql`
      select m."userId" as user_id, u.name, ${inOut}
      from stock_movements m left join users u on u.id = m."userId" where ${W} group by 1, 2 order by 3 desc`),
    rows<{
      id: string; created_at: string; type: string; quantity: number; previous_stock: number; new_stock: number;
      reason: string | null; product_id: string; product: string; sku: string; unit: string; warehouse_id: string;
      warehouse: string; user_id: string | null; user_name: string | null; sale_id: string | null;
      purchase_id: string | null; reference: string | null;
    }>(sql`
      select m.id, m."createdAt" as created_at, m.type, m.quantity, m."previousStock" as previous_stock,
             m."newStock" as new_stock, m.reason, m."productId" as product_id, pr.name as product, pr.sku, pr.unit,
             m."warehouseId" as warehouse_id, w.name as warehouse, m."userId" as user_id, u.name as user_name,
             m."saleId" as sale_id, m."purchaseId" as purchase_id, coalesce(s.reference, pu.reference) as reference
      from stock_movements m join products pr on pr.id = m."productId" join warehouses w on w.id = m."warehouseId"
      left join users u on u.id = m."userId" left join sales s on s.id = m."saleId"
      left join purchases pu on pu.id = m."purchaseId"
      where ${W} order by m."createdAt" desc limit 2001`),
    people(organizationId),
  ]);
  const io = (r: InOut) => ({ count: r.count, unitsIn: r.units_in, unitsOut: r.units_out, net: r.units_in - r.units_out });
  return {
    range: { from: p.from, to: p.to },
    filters: f,
    totals: io(totals),
    byType: byType.map((r) => ({ type: r.type, ...io(r) })),
    byProduct: byProduct.map((r) => ({
      productId: r.product_id,
      name: r.name,
      sku: r.sku,
      unit: r.unit,
      ...io(r),
      // The net change valued at the product's current purchase price.
      netValue: money((r.units_in - r.units_out) * r.cost),
    })),
    byUser: byUser.map((r) => ({ userId: r.user_id, name: r.name ?? "Unknown", ...io(r) })),
    movements: list.slice(0, 2000).map((r) => ({
      id: r.id,
      createdAt: r.created_at,
      type: r.type,
      quantity: r.quantity,
      previousStock: r.previous_stock,
      newStock: r.new_stock,
      reason: r.reason,
      productId: r.product_id,
      product: r.product,
      sku: r.sku,
      unit: r.unit,
      warehouseId: r.warehouse_id,
      warehouse: r.warehouse,
      userId: r.user_id,
      user: r.user_name,
      source: r.sale_id ? "sale" : r.purchase_id ? "purchase" : "manual",
      saleId: r.sale_id,
      purchaseId: r.purchase_id,
      reference: r.reference,
    })),
    truncated: list.length > 2000,
    people: staff,
  };
}
