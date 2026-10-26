import { NextResponse, after } from "next/server";
import { denyIfForbidden, guardApi } from "@/lib/api-context";
import { logAudit } from "@/lib/audit";
import { roundMoney } from "@/lib/credit";
import { SALE_STATUSES, createSale, getSale, listSales, parseSaleInput, saleTotals, sellingPrices } from "@/lib/sales";
import { detectStockAlert, notifyStockAlert } from "@/lib/stock-alerts";
import { isUuid } from "@/lib/validation";

const MAX_LIMIT = 200;

function date(value: string | null) {
  if (value === null) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

export async function GET(request: Request) {
  const context = await guardApi(request, "sales.view");

  if (context instanceof NextResponse) return context;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const customerId = searchParams.get("customerId");
  const warehouseId = searchParams.get("warehouseId");
  const from = date(searchParams.get("from"));
  const to = date(searchParams.get("to"));
  const requested = Number(searchParams.get("limit"));

  if (status && status !== "unpaid" && !(SALE_STATUSES as readonly string[]).includes(status)) {
    return NextResponse.json({ error: "status must be completed, voided or unpaid." }, { status: 400 });
  }
  if ((customerId && !isUuid(customerId)) || (warehouseId && !isUuid(warehouseId))) {
    return NextResponse.json({ error: "customerId and warehouseId must be valid ids." }, { status: 400 });
  }
  if (from === undefined || to === undefined) {
    return NextResponse.json({ error: "from and to must be dates." }, { status: 400 });
  }

  const result = await listSales(context.organizationId, {
    status: status && status !== "unpaid" ? status : undefined,
    unpaid: status === "unpaid",
    customerId: customerId ?? undefined,
    warehouseId: warehouseId ?? undefined,
    from: from ?? undefined,
    to: to ?? undefined,
    limit: Number.isInteger(requested) && requested > 0 ? Math.min(requested, MAX_LIMIT) : 100,
  });

  return NextResponse.json({ sales: result });
}

export async function POST(request: Request) {
  const context = await guardApi(request, "sales.create");

  if (context instanceof NextResponse) return context;

  const parsed = parseSaleInput(await request.json().catch(() => null));

  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const input = parsed.data;

  // Prices come from the product unless the seller may change them; a sale
  // at another price, or with a discount, needs sales.discount.
  const prices = await sellingPrices(context.organizationId, input.lines.map((l) => l.productId));
  const missing = input.lines.find((l) => !prices.has(l.productId));
  if (missing) {
    return NextResponse.json(
      { error: "One of the products doesn't exist or is archived.", code: "invalid_product" },
      { status: 400 },
    );
  }
  const lines = input.lines.map((l) => ({
    productId: l.productId,
    quantity: l.quantity,
    unitPrice: l.unitPrice ?? prices.get(l.productId)!.price,
  }));
  const changedPrice = lines.some((l) => Math.abs(l.unitPrice - prices.get(l.productId)!.price) > 0.004);
  if (changedPrice || input.discount > 0) {
    const denied = denyIfForbidden(context, "sales.discount");
    if (denied) return denied;
  }
  if (input.allowOverLimit) {
    const denied = denyIfForbidden(context, "sales.override");
    if (denied) return denied;
  }

  const { subtotal, total } = saleTotals(lines, input.discount, input.tax);
  if (total < 0) {
    return NextResponse.json({ error: "The discount can't be more than the sale is worth." }, { status: 400 });
  }
  const amountPaid = input.amountPaid ?? total;
  if (roundMoney(amountPaid) > total) {
    return NextResponse.json(
      { error: "The amount paid can't be more than the total.", code: "overpayment" },
      { status: 400 },
    );
  }

  const outcome = await createSale({
    organizationId: context.organizationId,
    userId: context.userId,
    input,
    lines,
    amountPaid: roundMoney(amountPaid),
    subtotal,
    total,
  });

  if (!outcome.ok) {
    return NextResponse.json(outcome.body, { status: outcome.status });
  }

  const saleId = String(outcome.result.saleId);

  if (outcome.result.duplicate) {
    return NextResponse.json({ sale: await getSale(context.organizationId, saleId), duplicate: true });
  }

  await logAudit({
    organizationId: context.organizationId,
    userId: context.userId,
    module: "sale",
    action: "sale.created",
    recordId: saleId,
    newValue: {
      reference: outcome.result.reference,
      total,
      amountPaid,
      lines: lines.length,
      customerId: input.customerId,
      overLimit: outcome.result.overLimit,
    },
  });

  // A sale can take products down to their reorder level or out of stock.
  const stock = (outcome.result.stock ?? []) as {
    productId: string;
    name: string;
    sku: string;
    previousTotal: number;
    newTotal: number;
    minStock: number;
  }[];
  const alerts = stock
    .map((s) => ({ ...s, alert: detectStockAlert(s.previousTotal, s.newTotal, s.minStock) }))
    .filter((s) => s.alert !== null);
  if (alerts.length > 0) {
    after(async () => {
      for (const a of alerts) {
        await notifyStockAlert(context.organizationId, a.alert!, {
          productId: a.productId,
          name: a.name,
          sku: a.sku,
          currentStock: a.newTotal,
          minStock: a.minStock,
        });
      }
    });
  }

  return NextResponse.json(
    {
      sale: await getSale(context.organizationId, saleId),
      alerts: alerts.map((a) => ({ productId: a.productId, alert: a.alert })),
    },
    { status: 201 },
  );
}
