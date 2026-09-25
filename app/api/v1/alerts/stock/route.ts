import { NextResponse } from "next/server";
import { guardApi } from "@/lib/api-context";
import { getStockAlerts } from "@/lib/stock-alerts";

export async function GET(request: Request) {
  const context = await guardApi(request);

  if (context instanceof NextResponse) return context;

  return NextResponse.json(await getStockAlerts(context.organizationId));
}
