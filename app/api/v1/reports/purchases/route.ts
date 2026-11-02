import { NextResponse } from "next/server";
import { guardApi } from "@/lib/api-context";
import { purchasesReport, readReportParams } from "@/lib/reports";

// The purchase report for a period: see purchasesReport in lib/reports.ts.
export async function GET(request: Request) {
  const context = await guardApi(request, "purchases.view");
  if (context instanceof NextResponse) return context;
  const params = readReportParams(request.url, { supplierId: "uuid", warehouseId: "uuid", productId: "uuid" });
  if (params instanceof NextResponse) return params;
  return NextResponse.json(await purchasesReport(context.organizationId, params));
}
