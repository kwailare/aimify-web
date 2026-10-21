import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { warehouses } from "@/db/schema";
import { denyIfChangeForbidden, guardApi } from "@/lib/api-context";
import { logAudit } from "@/lib/audit";
import { checkPlanLimit } from "@/lib/plans";
import { getHeldStock } from "@/lib/product-stock";
import { isUuid } from "@/lib/validation";
import { parseWarehouseFields } from "@/lib/warehouse-input";
import { syncPrimaryWarehouseName } from "@/lib/warehouses";

type Params = { params: Promise<{ id: string }> };

const NOT_FOUND = () =>
  NextResponse.json({ error: "Warehouse not found." }, { status: 404 });

export async function PATCH(request: Request, { params }: Params) {
  const context = await guardApi(request);

  if (context instanceof NextResponse) return context;

  const { id } = await params;

  if (!isUuid(id)) return NOT_FOUND();

  const body = await request.json().catch(() => null);
  const parsed = parseWarehouseFields(body);

  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { data } = parsed;

  const denied = denyIfChangeForbidden(context, data, {
    status: "warehouses.disable",
    fields: "warehouses.edit",
  });

  if (denied) return denied;

  if (Object.keys(data).length === 0) {
    return NextResponse.json(
      { error: "Send at least one field to update." },
      { status: 400 },
    );
  }

  const [before] = await db
    .select()
    .from(warehouses)
    .where(
      and(
        eq(warehouses.id, id),
        eq(warehouses.organizationId, context.organizationId),
      ),
    )
    .limit(1);

  if (!before) return NOT_FOUND();

  if (data.status === "inactive" && before.status === "active") {
    const held = await getHeldStock(context.organizationId, id);

    if (held.length > 0) {
      const units = held.reduce((sum, row) => sum + row.quantity, 0);
      const listed = held.slice(0, 5).map((row) => `${row.name} (${row.quantity})`).join(", ");
      const more = held.length > 5 ? ` and ${held.length - 5} more` : "";

      return NextResponse.json(
        {
          error: `${before.name} still holds stock: ${listed}${more}. Move it out with stock out or an adjustment before disabling the warehouse.`,
          code: "warehouse_not_empty",
          units,
          products: held.length,
        },
        { status: 409 },
      );
    }
  }

  if (data.status === "active" && before.status !== "active") {
    const limit = await checkPlanLimit(context.organizationId, "warehouses");

    if (!limit.allowed) {
      return NextResponse.json(
        {
          error: `${limit.message} Disable another one first.`,
          code: "plan_limit",
          limit: limit.limit,
          used: limit.used,
        },
        { status: 403 },
      );
    }
  }

  const [warehouse] = await db
    .update(warehouses)
    .set(data)
    .where(
      and(
        eq(warehouses.id, id),
        eq(warehouses.organizationId, context.organizationId),
      ),
    )
    .returning();

  if (!warehouse) return NOT_FOUND();

  if (data.name) {
    await syncPrimaryWarehouseName(context.organizationId);
  }

  const previousValue: Record<string, unknown> = {};
  const newValue: Record<string, unknown> = {};

  for (const key of Object.keys(data) as (keyof typeof data)[]) {
    if (before[key] !== warehouse[key]) {
      previousValue[key] = before[key];
      newValue[key] = warehouse[key];
    }
  }

  await logAudit({
    organizationId: context.organizationId,
    userId: context.userId,
    module: "warehouse",
    action: "warehouse.updated",
    recordId: id,
    previousValue,
    newValue,
  });

  return NextResponse.json({ warehouse });
}
