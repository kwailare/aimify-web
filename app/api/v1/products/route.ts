import { NextResponse } from "next/server";
import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { products } from "@/db/schema";
import { guardApi } from "@/lib/api-context";
import { logAudit } from "@/lib/audit";
import { registerCatalogOption } from "@/lib/catalog";
import { checkStockBounds, parseProductFields } from "@/lib/product-input";

export async function GET(request: Request) {
  const context = await guardApi(request);

  if (context instanceof NextResponse) return context;

  const { searchParams } = new URL(request.url);
  const includeArchived = searchParams.get("includeArchived") === "true";

  const conditions = [eq(products.organizationId, context.organizationId)];

  if (!includeArchived) {
    conditions.push(ne(products.status, "archived"));
  }

  const rows = await db
    .select()
    .from(products)
    .where(and(...conditions));

  return NextResponse.json({ products: rows });
}

export async function POST(request: Request) {
  const context = await guardApi(request, "products.write");

  if (context instanceof NextResponse) return context;

  const body = await request.json().catch(() => null);
  const parsed = parseProductFields(body);

  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { data } = parsed;

  if (!data.sku || !data.name) {
    return NextResponse.json(
      { error: "sku and name are required." },
      { status: 400 },
    );
  }

  const boundsError = checkStockBounds(data.minStock ?? 0, data.maxStock ?? null);

  if (boundsError) {
    return NextResponse.json({ error: boundsError }, { status: 400 });
  }

  const [existing] = await db
    .select({ id: products.id })
    .from(products)
    .where(
      and(
        eq(products.organizationId, context.organizationId),
        eq(products.sku, data.sku),
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
      ...data,
      sku: data.sku,
      name: data.name,
      organizationId: context.organizationId,
    })
    .returning();

  await registerCatalogOption(context.organizationId, "category", product.category);
  await registerCatalogOption(context.organizationId, "unit", product.unit);

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
