import { NextResponse } from "next/server";
import { guardApi } from "@/lib/api-context";
import { logAudit } from "@/lib/audit";
import {
  checkReferences,
  computeTotals,
  getPurchase,
  parsePurchaseInput,
  rewritePurchase,
} from "@/lib/purchases";
import { isUuid } from "@/lib/validation";

type Params = { params: Promise<{ id: string }> };

const NOT_FOUND = () => NextResponse.json({ error: "Purchase not found." }, { status: 404 });

export async function GET(request: Request, { params }: Params) {
  const context = await guardApi(request, "purchases.view");

  if (context instanceof NextResponse) return context;

  const { id } = await params;

  if (!isUuid(id)) return NOT_FOUND();

  const purchase = await getPurchase(context.organizationId, id);

  return purchase ? NextResponse.json({ purchase }) : NOT_FOUND();
}

// Edits a draft or pending purchase nothing has been received on: any of
// the header fields, the whole list of lines, or moving it between draft and
// pending ("place the order").
export async function PATCH(request: Request, { params }: Params) {
  const context = await guardApi(request, "purchases.create");

  if (context instanceof NextResponse) return context;

  const { id } = await params;

  if (!isUuid(id)) return NOT_FOUND();

  const parsed = parsePurchaseInput(await request.json().catch(() => null));

  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { data } = parsed;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Send at least one field to update." }, { status: 400 });
  }

  const before = await getPurchase(context.organizationId, id);

  if (!before) return NOT_FOUND();

  if (!["draft", "pending"].includes(before.status) || before.postedAt) {
    return NextResponse.json(
      {
        error: "Only a draft or pending purchase with nothing received can be changed.",
        code: "purchase_locked",
        status: before.status,
      },
      { status: 409 },
    );
  }

  const problem = await checkReferences(context.organizationId, {
    supplierId: data.supplierId,
    warehouseId: data.warehouseId,
    productIds: data.lines?.map((line) => line.productId),
  });

  if (problem) {
    return NextResponse.json({ error: problem.error, code: problem.code }, { status: 400 });
  }

  const lines =
    data.lines ??
    before.lines.map((line) => ({ productId: line.productId, quantity: line.quantity, unitCost: line.unitCost }));
  const discount = data.discount ?? before.discount;
  const tax = data.tax ?? before.tax;
  const { subtotal, total } = computeTotals(lines, discount, tax);

  if (total < 0) {
    return NextResponse.json({ error: "The discount can't be more than the purchase is worth." }, { status: 400 });
  }

  if (total < before.amountPaid) {
    return NextResponse.json(
      {
        error: `${before.amountPaid} has already been paid on this purchase, so its total can't go below that.`,
        code: "overpayment",
      },
      { status: 409 },
    );
  }

  const fields: Record<string, unknown> = { subtotal, discount, tax, total };
  for (const key of ["supplierId", "warehouseId", "status", "orderDate", "expectedDate", "notes"] as const) {
    if (key in data) fields[key] = data[key];
  }

  const updated = await rewritePurchase({
    organizationId: context.organizationId,
    purchaseId: id,
    fields,
    lines: data.lines ?? null,
  });

  if (!updated) {
    return NextResponse.json(
      { error: "This purchase was received or cancelled meanwhile, so it can't be changed.", code: "purchase_locked" },
      { status: 409 },
    );
  }

  const changed = Object.keys(data);
  await logAudit({
    organizationId: context.organizationId,
    userId: context.userId,
    module: "purchase",
    action: "purchase.updated",
    recordId: id,
    previousValue: { status: before.status, total: before.total, lines: before.lines.length },
    newValue: { status: data.status ?? before.status, total, lines: lines.length, changed },
  });

  return NextResponse.json({ purchase: await getPurchase(context.organizationId, id) });
}
