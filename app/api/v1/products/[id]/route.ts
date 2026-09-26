import { NextResponse } from "next/server";
import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { products } from "@/db/schema";
import { guardApi } from "@/lib/api-context";
import { checkPlanLimit } from "@/lib/plans";
import { logAudit } from "@/lib/audit";
import { registerCatalogOption } from "@/lib/catalog";
import { checkStockBounds, parseProductFields } from "@/lib/product-input";
import { isUuid } from "@/lib/validation";

type Params = { params: Promise<{ id: string }> };

async function findProduct(organizationId: string, id: string) {
  const [product] = await db
    .select()
    .from(products)
    .where(and(eq(products.id, id), eq(products.organizationId, organizationId)))
    .limit(1);

  return product ?? null;
}

const NOT_FOUND = () =>
  NextResponse.json({ error: "Product not found." }, { status: 404 });

export async function GET(request: Request, { params }: Params) {
  const context = await guardApi(request);

  if (context instanceof NextResponse) return context;

  const { id } = await params;

  if (!isUuid(id)) return NOT_FOUND();

  const product = await findProduct(context.organizationId, id);

  return product ? NextResponse.json({ product }) : NOT_FOUND();
}

export async function PATCH(request: Request, { params }: Params) {
  const context = await guardApi(request, "products.write");

  if (context instanceof NextResponse) return context;

  const { id } = await params;

  if (!isUuid(id)) return NOT_FOUND();

  const body = await request.json().catch(() => null);
  const parsed = parseProductFields(body);

  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { data } = parsed;

  if (Object.keys(data).length === 0) {
    return NextResponse.json(
      { error: "Send at least one field to update." },
      { status: 400 },
    );
  }

  const before = await findProduct(context.organizationId, id);

  if (!before) return NOT_FOUND();

  const boundsError = checkStockBounds(
    data.minStock ?? before.minStock,
    data.maxStock === undefined ? before.maxStock : data.maxStock,
  );

  if (boundsError) {
    return NextResponse.json({ error: boundsError }, { status: 400 });
  }

  if (data.sku && data.sku !== before.sku) {
    const [clash] = await db
      .select({ id: products.id })
      .from(products)
      .where(
        and(
          eq(products.organizationId, context.organizationId),
          eq(products.sku, data.sku),
          ne(products.id, id),
        ),
      )
      .limit(1);

    if (clash) {
      return NextResponse.json(
        { error: "A product with this SKU already exists." },
        { status: 409 },
      );
    }
  }

  if (data.status === "active" && before.status !== "active") {
    const limit = await checkPlanLimit(context.organizationId, "products");

    if (!limit.allowed) {
      return NextResponse.json(
        {
          error: `${limit.message} Archive another product first.`,
          code: "plan_limit",
          limit: limit.limit,
          used: limit.used,
        },
        { status: 403 },
      );
    }
  }

  const [product] = await db
    .update(products)
    .set({ ...data, updatedAt: new Date() })
    .where(
      and(eq(products.id, id), eq(products.organizationId, context.organizationId)),
    )
    .returning();

  if (!product) return NOT_FOUND();

  await registerCatalogOption(context.organizationId, "category", data.category);
  await registerCatalogOption(context.organizationId, "unit", data.unit);

  const previousValue: Record<string, unknown> = {};
  const newValue: Record<string, unknown> = {};

  for (const key of Object.keys(data) as (keyof typeof data)[]) {
    if (before[key] !== product[key]) {
      previousValue[key] = before[key];
      newValue[key] = product[key];
    }
  }

  await logAudit({
    organizationId: context.organizationId,
    userId: context.userId,
    module: "product",
    action: "product.updated",
    recordId: id,
    previousValue,
    newValue,
  });

  return NextResponse.json({ product });
}

export async function DELETE(request: Request, { params }: Params) {
  const context = await guardApi(request, "products.archive");

  if (context instanceof NextResponse) return context;

  const { id } = await params;

  if (!isUuid(id)) return NOT_FOUND();

  const [product] = await db
    .update(products)
    .set({ status: "archived", updatedAt: new Date() })
    .where(
      and(eq(products.id, id), eq(products.organizationId, context.organizationId)),
    )
    .returning();

  if (!product) return NOT_FOUND();

  await logAudit({
    organizationId: context.organizationId,
    userId: context.userId,
    module: "product",
    action: "product.archived",
    recordId: id,
    newValue: { sku: product.sku, name: product.name },
  });

  return NextResponse.json({ product });
}
