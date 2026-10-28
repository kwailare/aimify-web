import { NextResponse } from "next/server";
import { and, desc, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { products, purchaseLines, purchases, suppliers } from "@/db/schema";
import { guardApi } from "@/lib/api-context";
import { roundMoney } from "@/lib/credit";
import { isUuid } from "@/lib/validation";

const HISTORY = 10;

// What each product has cost from one supplier: its latest unit cost, the
// one before it and the change, and up to ten earlier prices, newest first.
// Every purchase except drafts and cancelled ones counts (an order placed is
// a price agreed).
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await guardApi(request, "suppliers.view");
  if (context instanceof NextResponse) return context;

  const { id } = await params;
  const notFound = NextResponse.json({ error: "Supplier not found." }, { status: 404 });
  if (!isUuid(id)) return notFound;
  const [supplier] = await db
    .select({ id: suppliers.id })
    .from(suppliers)
    .where(and(eq(suppliers.id, id), eq(suppliers.organizationId, context.organizationId)))
    .limit(1);
  if (!supplier) return notFound;

  const rows = await db
    .select({
      productId: purchaseLines.productId,
      name: products.name,
      sku: products.sku,
      unit: products.unit,
      currentCost: products.purchasePrice,
      unitCost: purchaseLines.unitCost,
      quantity: purchaseLines.quantity,
      reference: purchases.reference,
      purchaseId: purchases.id,
      date: purchases.orderDate,
    })
    .from(purchaseLines)
    .innerJoin(purchases, eq(purchases.id, purchaseLines.purchaseId))
    .innerJoin(products, eq(products.id, purchaseLines.productId))
    .where(
      and(
        eq(purchases.organizationId, context.organizationId),
        eq(purchases.supplierId, id),
        ne(purchases.status, "cancelled"),
        ne(purchases.status, "draft"),
      ),
    )
    .orderBy(desc(purchases.orderDate), desc(purchases.number));

  const byProduct = new Map<string, typeof rows>();
  for (const row of rows) {
    const list = byProduct.get(row.productId) ?? [];
    list.push(row);
    byProduct.set(row.productId, list);
  }

  const result = [...byProduct.values()].map((history) => {
    const [last, previous] = history;
    const lastCost = roundMoney(last.unitCost);
    const previousCost = previous ? roundMoney(previous.unitCost) : null;
    const change = previousCost === null ? null : roundMoney(lastCost - previousCost);
    return {
      productId: last.productId,
      name: last.name,
      sku: last.sku,
      unit: last.unit,
      currentCost: roundMoney(last.currentCost),
      lastCost,
      lastDate: last.date,
      lastReference: last.reference,
      previousCost,
      change,
      changePercent: previousCost ? roundMoney(((lastCost - previousCost) / previousCost) * 100) : null,
      timesBought: history.length,
      history: history.slice(0, HISTORY).map((h) => ({
        date: h.date,
        reference: h.reference,
        purchaseId: h.purchaseId,
        unitCost: roundMoney(h.unitCost),
        quantity: h.quantity,
      })),
    };
  });
  result.sort((a, b) => a.name.localeCompare(b.name));

  return NextResponse.json({ products: result });
}
