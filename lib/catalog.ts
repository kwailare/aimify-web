import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { catalogOptions } from "@/db/schema";

export const DEFAULT_UNITS = [
  "piece",
  "carton",
  "bag",
  "box",
  "pack",
  "kilogram",
  "litre",
  "meter",
];

export type CatalogKind = "category" | "unit";

export async function seedDefaultUnits(organizationId: string) {
  await db
    .insert(catalogOptions)
    .values(
      DEFAULT_UNITS.map((name) => ({ organizationId, kind: "unit", name })),
    )
    .onConflictDoNothing();
}

export async function registerCatalogOption(
  organizationId: string,
  kind: CatalogKind,
  name: string | null | undefined,
) {
  const trimmed = name?.trim();

  if (!trimmed) return;

  const [existing] = await db
    .select({ id: catalogOptions.id })
    .from(catalogOptions)
    .where(
      and(
        eq(catalogOptions.organizationId, organizationId),
        eq(catalogOptions.kind, kind),
        eq(catalogOptions.name, trimmed),
      ),
    )
    .limit(1);

  if (existing) return;

  await db
    .insert(catalogOptions)
    .values({ organizationId, kind, name: trimmed })
    .onConflictDoNothing();
}
