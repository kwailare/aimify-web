import { NextResponse } from "next/server";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { catalogOptions, products } from "@/db/schema";
import { guardApi } from "@/lib/api-context";
import type { CatalogKind } from "@/lib/catalog";
import { isUuid } from "@/lib/validation";

const PLURAL: Record<CatalogKind, string> = {
  category: "categories",
  unit: "units",
};

export async function listOptions(request: Request, kind: CatalogKind) {
  const context = await guardApi(request);

  if (context instanceof NextResponse) return context;

  const rows = await db
    .select({ id: catalogOptions.id, name: catalogOptions.name })
    .from(catalogOptions)
    .where(
      and(
        eq(catalogOptions.organizationId, context.organizationId),
        eq(catalogOptions.kind, kind),
      ),
    )
    .orderBy(asc(catalogOptions.name));

  return NextResponse.json({ [PLURAL[kind]]: rows });
}

export async function createOption(request: Request, kind: CatalogKind) {
  const context = await guardApi(request);

  if (context instanceof NextResponse) return context;

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";

  if (!name || name.length > 60) {
    return NextResponse.json(
      { error: "name is required and must be at most 60 characters." },
      { status: 400 },
    );
  }

  const [existing] = await db
    .select({ id: catalogOptions.id })
    .from(catalogOptions)
    .where(
      and(
        eq(catalogOptions.organizationId, context.organizationId),
        eq(catalogOptions.kind, kind),
        sql`lower(${catalogOptions.name}) = lower(${name})`,
      ),
    )
    .limit(1);

  if (existing) {
    return NextResponse.json(
      { error: `This ${kind} already exists.` },
      { status: 409 },
    );
  }

  const [option] = await db
    .insert(catalogOptions)
    .values({ organizationId: context.organizationId, kind, name })
    .returning({ id: catalogOptions.id, name: catalogOptions.name });

  return NextResponse.json({ [kind]: option }, { status: 201 });
}

export async function deleteOption(
  request: Request,
  kind: CatalogKind,
  id: string,
) {
  const context = await guardApi(request);

  if (context instanceof NextResponse) return context;

  if (!isUuid(id)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const [option] = await db
    .select()
    .from(catalogOptions)
    .where(
      and(
        eq(catalogOptions.id, id),
        eq(catalogOptions.organizationId, context.organizationId),
        eq(catalogOptions.kind, kind),
      ),
    )
    .limit(1);

  if (!option) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const usedBy = kind === "category" ? products.category : products.unit;

  const [usage] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(products)
    .where(
      and(
        eq(products.organizationId, context.organizationId),
        eq(usedBy, option.name),
      ),
    );

  if ((usage?.count ?? 0) > 0) {
    return NextResponse.json(
      {
        error: `This ${kind} is used by ${usage.count} product(s). Change those products first.`,
      },
      { status: 409 },
    );
  }

  await db.delete(catalogOptions).where(eq(catalogOptions.id, id));

  return NextResponse.json({ deleted: true });
}
