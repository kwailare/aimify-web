import { NextResponse } from "next/server";
import { guardApi } from "@/lib/api-context";
import { MOVEMENT_SOURCES, MOVEMENT_TYPES, readReportParams, stockMovementsReport } from "@/lib/reports";

// Stock movement history for a period: see stockMovementsReport in
// lib/reports.ts.
export async function GET(request: Request) {
  const context = await guardApi(request, "stock.view");
  if (context instanceof NextResponse) return context;
  const params = readReportParams(request.url, {
    warehouseId: "uuid",
    productId: "uuid",
    userId: "uuid",
    type: MOVEMENT_TYPES,
    source: MOVEMENT_SOURCES,
  });
  if (params instanceof NextResponse) return params;
  return NextResponse.json(await stockMovementsReport(context.organizationId, params));
}
