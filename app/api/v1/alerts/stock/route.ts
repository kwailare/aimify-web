import { NextResponse } from "next/server";
import { guardApi } from "@/lib/api-context";
import { withWarehouseStock } from "@/lib/product-stock";
import { getStockAlerts } from "@/lib/stock-alerts";

export async function GET(request: Request) {
  const context = await guardApi(request, "stock.view");

  if (context instanceof NextResponse) return context;

  const { lowStock, outOfStock } = await getStockAlerts(context.organizationId);

  return NextResponse.json({
    lowStock: await withWarehouseStock(context.organizationId, lowStock),
    outOfStock: await withWarehouseStock(context.organizationId, outOfStock),
  });
}
