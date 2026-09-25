import { NextResponse } from "next/server";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { warehouses } from "@/db/schema";
import { guardApi } from "@/lib/api-context";
import { logAudit } from "@/lib/audit";
import { PLAN_LIMITS } from "@/lib/plan-limits";
import { parseWarehouseFields } from "@/lib/warehouse-input";
import { syncPrimaryWarehouseName } from "@/lib/warehouses";

export async function GET(request: Request) {
  const context = await guardApi(request);

  if (context instanceof NextResponse) return context;

  const rows = await db
    .select()
    .from(warehouses)
    .where(eq(warehouses.organizationId, context.organizationId))
    .orderBy(asc(warehouses.createdAt));

  return NextResponse.json({ warehouses: rows });
}

export async function POST(request: Request) {
  const context = await guardApi(request);

  if (context instanceof NextResponse) return context;

  const body = await request.json().catch(() => null);
  const parsed = parseWarehouseFields(body);

  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { data } = parsed;

  if (!data.name) {
    return NextResponse.json({ error: "name is required." }, { status: 400 });
  }

  const [active] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(warehouses)
    .where(
      and(
        eq(warehouses.organizationId, context.organizationId),
        eq(warehouses.status, "active"),
      ),
    );

  if ((active?.count ?? 0) >= PLAN_LIMITS.maxActiveWarehouses) {
    return NextResponse.json(
      {
        error: `Your plan allows ${PLAN_LIMITS.maxActiveWarehouses} active warehouse(s). Disable one before adding another.`,
        code: "plan_limit",
      },
      { status: 403 },
    );
  }

  const [warehouse] = await db
    .insert(warehouses)
    .values({
      name: data.name,
      address: data.address,
      managerName: data.managerName,
      phone: data.phone,
      organizationId: context.organizationId,
    })
    .returning();

  await syncPrimaryWarehouseName(context.organizationId);

  await logAudit({
    organizationId: context.organizationId,
    userId: context.userId,
    module: "warehouse",
    action: "warehouse.created",
    recordId: warehouse.id,
    newValue: { name: warehouse.name },
  });

  return NextResponse.json({ warehouse }, { status: 201 });
}
