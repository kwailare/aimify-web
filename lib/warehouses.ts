import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { organizations, warehouses } from "@/db/schema";

export async function syncPrimaryWarehouseName(organizationId: string) {
  const [primary] = await db
    .select({ name: warehouses.name })
    .from(warehouses)
    .where(eq(warehouses.organizationId, organizationId))
    .orderBy(asc(warehouses.createdAt))
    .limit(1);

  await db
    .update(organizations)
    .set({ warehouseName: primary?.name ?? null })
    .where(eq(organizations.id, organizationId));
}

export async function getActiveWarehouse(
  organizationId: string,
  warehouseId: string,
) {
  const [warehouse] = await db
    .select()
    .from(warehouses)
    .where(
      and(
        eq(warehouses.id, warehouseId),
        eq(warehouses.organizationId, organizationId),
        eq(warehouses.status, "active"),
      ),
    )
    .limit(1);

  return warehouse ?? null;
}
