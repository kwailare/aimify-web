import { NextResponse } from "next/server";
import { guardApi } from "@/lib/api-context";
import { profitLossReport, readReportParams } from "@/lib/reports";

// Profit and loss, and money in and out, for a period: see profitLossReport
// in lib/reports.ts. Needs both sales.view and expenses.view.
export async function GET(request: Request) {
  const context = await guardApi(request, "sales.view");
  if (context instanceof NextResponse) return context;
  if (!context.permissions.has("expenses.view")) {
    return NextResponse.json(
      { error: "Profit and loss needs permission to view both sales and expenses." },
      { status: 403 },
    );
  }
  const params = readReportParams(request.url, { warehouseId: "uuid" });
  if (params instanceof NextResponse) return params;
  return NextResponse.json(await profitLossReport(context.organizationId, params));
}
