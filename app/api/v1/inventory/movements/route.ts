import { NextResponse, after } from "next/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { products, stockMovements } from "@/db/schema";
import { guardApi } from "@/lib/api-context";
import { logAudit } from "@/lib/audit";
import { detectStockAlert, notifyStockAlert } from "@/lib/stock-alerts";
import { isUuid } from "@/lib/validation";
import { getActiveWarehouse } from "@/lib/warehouses";

const VALID_TYPES = new Set(["stock_in", "stock_out", "adjustment", "count"]);

export async function GET(request: Request) {
  const context = await guardApi(request);

  if (context instanceof NextResponse) return context;

  const { searchParams } = new URL(request.url);
  const productId = searchParams.get("productId");

  if (productId && !isUuid(productId)) {
    return NextResponse.json(
      { error: "productId must be a valid id." },
      { status: 400 },
    );
  }

  const conditions = [eq(stockMovements.organizationId, context.organizationId)];

  if (productId) {
    conditions.push(eq(stockMovements.productId, productId));
  }

  const rows = await db
    .select()
    .from(stockMovements)
    .where(and(...conditions))
    .orderBy(desc(stockMovements.createdAt))
    .limit(100);

  return NextResponse.json({ movements: rows });
}

export async function POST(request: Request) {
  const context = await guardApi(request);

  if (context instanceof NextResponse) return context;

  const body = await request.json().catch(() => null);

  const productId = typeof body?.productId === "string" ? body.productId : null;
  const warehouseId =
    typeof body?.warehouseId === "string" ? body.warehouseId : null;
  const type = typeof body?.type === "string" ? body.type : null;
  const quantity = typeof body?.quantity === "number" ? body.quantity : null;
  const reason = typeof body?.reason === "string" ? body.reason : null;

  if (
    !productId ||
    !warehouseId ||
    !type ||
    !VALID_TYPES.has(type) ||
    !quantity ||
    !Number.isInteger(quantity)
  ) {
    return NextResponse.json(
      {
        error:
          "productId, warehouseId, a valid type, and a non-zero whole-number quantity are required.",
      },
      { status: 400 },
    );
  }

  if (!isUuid(productId) || !isUuid(warehouseId)) {
    return NextResponse.json(
      { error: "productId and warehouseId must be valid ids." },
      { status: 400 },
    );
  }

  const warehouse = await getActiveWarehouse(
    context.organizationId,
    warehouseId,
  );

  if (!warehouse) {
    return NextResponse.json(
      { error: "Warehouse not found or not active." },
      { status: 404 },
    );
  }

  const [updated] = await db
    .update(products)
    .set({
      currentStock: sql`${products.currentStock} + ${quantity}`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(products.id, productId),
        eq(products.organizationId, context.organizationId),
      ),
    )
    .returning({
      currentStock: products.currentStock,
      minStock: products.minStock,
      name: products.name,
      sku: products.sku,
    });

  if (!updated) {
    return NextResponse.json({ error: "Product not found." }, { status: 404 });
  }

  const newStock = updated.currentStock;
  const previousStock = newStock - quantity;

  const [movement] = await db
    .insert(stockMovements)
    .values({
      organizationId: context.organizationId,
      warehouseId,
      productId,
      userId: context.userId,
      type,
      quantity,
      reason,
      previousStock,
      newStock,
    })
    .returning();

  const alert = detectStockAlert(previousStock, newStock, updated.minStock);

  if (alert) {
    after(() =>
      notifyStockAlert(context.organizationId, alert, {
        name: updated.name,
        sku: updated.sku,
        currentStock: newStock,
        minStock: updated.minStock,
      }),
    );
  }

  await logAudit({
    organizationId: context.organizationId,
    userId: context.userId,
    module: "inventory",
    action: `inventory.${type}`,
    recordId: productId,
    previousValue: { currentStock: previousStock },
    newValue: { currentStock: newStock },
  });

  return NextResponse.json(
    { movement, currentStock: newStock, alert },
    { status: 201 },
  );
}
