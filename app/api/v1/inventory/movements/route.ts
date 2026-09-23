import { NextResponse } from "next/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { products, stockMovements } from "@/db/schema";
import { getApiOrgContext } from "@/lib/api-context";
import { logAudit } from "@/lib/audit";

const VALID_TYPES = new Set(["stock_in", "stock_out", "adjustment", "count"]);

export async function GET(request: Request) {
  const context = await getApiOrgContext(request);

  if (!context) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const productId = searchParams.get("productId");

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
  const context = await getApiOrgContext(request);

  if (!context) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

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
    !quantity
  ) {
    return NextResponse.json(
      {
        error:
          "productId, warehouseId, a valid type, and a non-zero quantity are required.",
      },
      { status: 400 },
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
    .returning({ currentStock: products.currentStock });

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

  await logAudit({
    organizationId: context.organizationId,
    userId: context.userId,
    module: "inventory",
    action: `inventory.${type}`,
    recordId: productId,
    previousValue: { currentStock: previousStock },
    newValue: { currentStock: newStock },
  });

  return NextResponse.json({ movement, currentStock: newStock }, { status: 201 });
}
