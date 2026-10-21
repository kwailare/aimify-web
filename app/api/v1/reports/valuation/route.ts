import { NextResponse } from "next/server";
import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { productStock, products, warehouses } from "@/db/schema";
import { denyIfForbidden, guardApi } from "@/lib/api-context";
import { isUuid } from "@/lib/validation";

type Totals = {
  products: number;
  units: number;
  valueAtCost: number;
  valueAtRetail: number;
  margin: number;
  marginPercent: number | null;
};

const round = (value: number) => Math.round(value * 100) / 100;

function totalsOf(
  rows: { productId: string; quantity: number; valueAtCost: number; valueAtRetail: number }[],
): Totals {
  const valueAtCost = round(rows.reduce((sum, row) => sum + row.valueAtCost, 0));
  const valueAtRetail = round(rows.reduce((sum, row) => sum + row.valueAtRetail, 0));
  const margin = round(valueAtRetail - valueAtCost);
  return {
    products: new Set(rows.map((row) => row.productId)).size,
    units: rows.reduce((sum, row) => sum + row.quantity, 0),
    valueAtCost,
    valueAtRetail,
    margin,
    marginPercent: valueAtRetail > 0 ? round((margin / valueAtRetail) * 100) : null,
  };
}

// Inventory valuation as of now: each warehouse balance priced at the
// product's current purchase and selling price. Optional warehouseId and
// category narrow every section, totals included.
export async function GET(request: Request) {
  const context = await guardApi(request, "products.view");

  if (context instanceof NextResponse) return context;

  const denied = denyIfForbidden(context, "stock.view");
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const warehouseId = searchParams.get("warehouseId");
  const category = searchParams.get("category");

  if (warehouseId && !isUuid(warehouseId)) {
    return NextResponse.json({ error: "warehouseId must be a valid id." }, { status: 400 });
  }

  const conditions = [
    eq(productStock.organizationId, context.organizationId),
    ne(productStock.quantity, 0),
  ];
  if (warehouseId) conditions.push(eq(productStock.warehouseId, warehouseId));

  const balances = await db
    .select({
      productId: products.id,
      sku: products.sku,
      name: products.name,
      category: products.category,
      unit: products.unit,
      status: products.status,
      unitCost: products.purchasePrice,
      unitPrice: products.sellingPrice,
      warehouseId: warehouses.id,
      warehouseName: warehouses.name,
      warehouseStatus: warehouses.status,
      quantity: productStock.quantity,
    })
    .from(productStock)
    .innerJoin(products, eq(productStock.productId, products.id))
    .innerJoin(warehouses, eq(productStock.warehouseId, warehouses.id))
    .where(and(...conditions));

  const lines = balances
    .filter((row) => category === null || (row.category ?? "") === category)
    .map((row) => {
      const unitCost = Number(row.unitCost);
      const unitPrice = Number(row.unitPrice);
      return {
        ...row,
        unitCost,
        unitPrice,
        valueAtCost: round(row.quantity * unitCost),
        valueAtRetail: round(row.quantity * unitPrice),
      };
    });

  const byProductMap = new Map<string, (typeof lines)[number][]>();
  for (const line of lines) {
    byProductMap.set(line.productId, [...(byProductMap.get(line.productId) ?? []), line]);
  }

  const byProduct = [...byProductMap.values()]
    .map((group) => {
      const [first] = group;
      const totals = totalsOf(group);
      const flags = [
        ...(totals.units < 0 || group.some((line) => line.quantity < 0) ? ["negative_stock"] : []),
        ...(first.unitCost === 0 ? ["no_cost"] : []),
        ...(first.status === "archived" ? ["archived"] : []),
      ];
      return {
        productId: first.productId,
        sku: first.sku,
        name: first.name,
        category: first.category,
        unit: first.unit,
        quantity: totals.units,
        unitCost: first.unitCost,
        unitPrice: first.unitPrice,
        valueAtCost: totals.valueAtCost,
        valueAtRetail: totals.valueAtRetail,
        margin: totals.margin,
        warehouses: group.map((line) => ({ warehouseId: line.warehouseId, quantity: line.quantity })),
        flags,
      };
    })
    .sort((a, b) => b.valueAtCost - a.valueAtCost || a.name.localeCompare(b.name));

  const group = <K extends string>(key: (line: (typeof lines)[number]) => K) => {
    const map = new Map<K, (typeof lines)[number][]>();
    for (const line of lines) map.set(key(line), [...(map.get(key(line)) ?? []), line]);
    return map;
  };

  const byCategory = [...group((line) => line.category ?? "").entries()]
    .map(([name, rows]) => ({ category: name || null, ...totalsOf(rows) }))
    .sort((a, b) => b.valueAtCost - a.valueAtCost);

  const byWarehouse = [...group((line) => line.warehouseId).entries()]
    .map(([id, rows]) => ({
      warehouseId: id,
      name: rows[0].warehouseName,
      status: rows[0].warehouseStatus,
      ...totalsOf(rows),
    }))
    .sort((a, b) => b.valueAtCost - a.valueAtCost);

  return NextResponse.json({
    asOf: new Date().toISOString(),
    basis: "current_purchase_price",
    filters: { warehouseId, category },
    totals: totalsOf(lines),
    byProduct,
    byCategory,
    byWarehouse,
    warnings: {
      negativeStock: byProduct.filter((row) => row.flags.includes("negative_stock")).length,
      noCost: byProduct.filter((row) => row.flags.includes("no_cost")).length,
    },
  });
}
