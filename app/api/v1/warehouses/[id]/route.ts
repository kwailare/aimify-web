import { NextResponse } from "next/server";
import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { warehouses } from "@/db/schema";
import { guardApi } from "@/lib/api-context";
import { logAudit } from "@/lib/audit";
import { PLAN_LIMITS } from "@/lib/plan-limits";
import { isUuid } from "@/lib/validation";
import { parseWarehouseFields } from "@/lib/warehouse-input";
import { syncPrimaryWarehouseName } from "@/lib/warehouses";

type Params = { params: Promise<{ id: string }> };

const NOT_FOUND = () =>
  NextResponse.json({ error: "Warehouse not found." }, { status: 404 });

export async function PATCH(request: Request, { params }: Params) {
  const context = await guardApi(request, "warehouses.manage");

  if (context instanceof NextResponse) return context;

  const { id } = await params;

  if (!isUuid(id)) return NOT_FOUND();

  const body = await request.json().catch(() => null);
  const parsed = parseWarehouseFields(body);

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

  if (data.status === "active" && before.status !== "active") {
    const [otherActive] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(warehouses)
      .where(
        and(
          eq(warehouses.organizationId, context.organizationId),
          eq(warehouses.status, "active"),
          ne(warehouses.id, id),
        ),
      );

    if ((otherActive?.count ?? 0) >= PLAN_LIMITS.maxActiveWarehouses) {
      return NextResponse.json(
        {
          error: `Your plan allows ${PLAN_LIMITS.maxActiveWarehouses} active warehouse(s). Disable another one first.`,
          code: "plan_limit",
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
