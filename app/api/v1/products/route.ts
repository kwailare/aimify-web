import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { products } from "@/db/schema";
import { getApiOrgContext } from "@/lib/api-context";
import { logAudit } from "@/lib/audit";

export async function GET(request: Request) {
  const context = await getApiOrgContext(request);

  if (!context) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const rows = await db
    .select()
    .from(products)
    .where(eq(products.organizationId, context.organizationId));

  return NextResponse.json({ products: rows });
}

export async function POST(request: Request) {
  const context = await getApiOrgContext(request);

  if (!context) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);

  const sku = typeof body?.sku === "string" ? body.sku.trim() : "";
  const name = typeof body?.name === "string" ? body.name.trim() : "";

  if (!sku || !name) {
    return NextResponse.json(
      { error: "sku and name are required." },
      { status: 400 },
    );
  }

  const [existing] = await db
    .select({ id: products.id })
    .from(products)
    .where(
      and(
        eq(products.organizationId, context.organizationId),
        eq(products.sku, sku),
      ),
    )
    .limit(1);

  if (existing) {
    return NextResponse.json(
      { error: "A product with this SKU already exists." },
      { status: 409 },
    );
  }

  const [product] = await db
    .insert(products)
    .values({
      organizationId: context.organizationId,
      sku,
      name,
      barcode: typeof body?.barcode === "string" ? body.barcode : null,
      description:
        typeof body?.description === "string" ? body.description : null,
      category: typeof body?.category === "string" ? body.category : null,
      unit: typeof body?.unit === "string" && body.unit ? body.unit : "piece",
      purchasePrice:
        typeof body?.purchasePrice === "number" ? body.purchasePrice : 0,
      sellingPrice:
        typeof body?.sellingPrice === "number" ? body.sellingPrice : 0,
      minStock: typeof body?.minStock === "number" ? body.minStock : 0,
    })
    .returning();

  await logAudit({
    organizationId: context.organizationId,
    userId: context.userId,
    module: "product",
    action: "product.created",
    recordId: product.id,
    newValue: { sku: product.sku, name: product.name },
  });

  return NextResponse.json({ product }, { status: 201 });
}
