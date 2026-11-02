import { NextResponse } from "next/server";
import { guardApi } from "@/lib/api-context";
import { readReportParams, salesReport } from "@/lib/reports";

// The sales report for a period: see salesReport in lib/reports.ts.
export async function GET(request: Request) {
  const context = await guardApi(request, "sales.view");
  if (context instanceof NextResponse) return context;
  const params = readReportParams(request.url, {
    warehouseId: "uuid",
    customerId: { uuidOr: ["walk-in"] },
    userId: "uuid",
    productId: "uuid",
  });
  if (params instanceof NextResponse) return params;
  return NextResponse.json(await salesReport(context.organizationId, params));
}
