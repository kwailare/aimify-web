import { NextResponse } from "next/server";
import { denyIfForbidden, guardApi } from "@/lib/api-context";
import { logAudit } from "@/lib/audit";
import { roundMoney } from "@/lib/credit";
import { outstandingLines, receivePurchase } from "@/lib/purchase-receiving";
import {
  PURCHASE_STATUSES,
  checkReferences,
  computeTotals,
  findPurchaseByClientRef,
  getPurchase,
  insertPurchase,
  listPurchases,
  parsePurchaseInput,
} from "@/lib/purchases";
import { isUuid } from "@/lib/validation";

const MAX_LIMIT = 200;

export async function GET(request: Request) {
  const context = await guardApi(request, "purchases.view");

  if (context instanceof NextResponse) return context;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const supplierId = searchParams.get("supplierId");
  const warehouseId = searchParams.get("warehouseId");
  const requested = Number(searchParams.get("limit"));

  if (status && status !== "open" && !(PURCHASE_STATUSES as readonly string[]).includes(status)) {
    return NextResponse.json(
      { error: `status must be open or one of: ${PURCHASE_STATUSES.join(", ")}.` },
      { status: 400 },
    );
  }

  if ((supplierId && !isUuid(supplierId)) || (warehouseId && !isUuid(warehouseId))) {
    return NextResponse.json({ error: "supplierId and warehouseId must be valid ids." }, { status: 400 });
  }

  const purchases = await listPurchases(context.organizationId, {
    status: status ?? undefined,
    supplierId: supplierId ?? undefined,
    warehouseId: warehouseId ?? undefined,
    limit: Number.isInteger(requested) && requested > 0 ? Math.min(requested, MAX_LIMIT) : 100,
  });

  return NextResponse.json({ purchases });
}

export async function POST(request: Request) {
  const context = await guardApi(request, "purchases.create");

  if (context instanceof NextResponse) return context;

  const body = await request.json().catch(() => null);
  const parsed = parsePurchaseInput(body);

  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { data } = parsed;
  const receive = body?.receive === true;
  const clientRef = typeof body?.clientRef === "string" ? body.clientRef : null;
  const amountPaid = body?.amountPaid === undefined ? 0 : body.amountPaid;

  if (!data.supplierId || !data.warehouseId || !data.lines) {
    return NextResponse.json({ error: "supplierId, warehouseId and lines are required." }, { status: 400 });
  }

  if (typeof amountPaid !== "number" || !Number.isFinite(amountPaid) || amountPaid < 0) {
    return NextResponse.json({ error: "amountPaid must be a number, 0 or more." }, { status: 400 });
  }

  if (clientRef !== null && (clientRef.length === 0 || clientRef.length > 100)) {
    return NextResponse.json({ error: "clientRef must be 1 to 100 characters." }, { status: 400 });
  }

  if (receive) {
    const denied = denyIfForbidden(context, "purchases.receive");
    if (denied) return denied;
  }

  // Paying is a money record, so it needs the same permission as the ledger.
  if (amountPaid > 0) {
    const denied = denyIfForbidden(context, "credit.record");
    if (denied) return denied;
  }

  // An offline purchase sent again returns the one already recorded.
  if (clientRef) {
    const existingId = await findPurchaseByClientRef(context.organizationId, clientRef);
    if (existingId) {
      return NextResponse.json({
        purchase: await getPurchase(context.organizationId, existingId),
        duplicate: true,
      });
    }
  }

  const discount = data.discount ?? 0;
  const tax = data.tax ?? 0;
  const { total } = computeTotals(data.lines, discount, tax);

  if (total < 0) {
    return NextResponse.json({ error: "The discount can't be more than the purchase is worth." }, { status: 400 });
  }

  if (roundMoney(amountPaid) > total) {
    return NextResponse.json(
      { error: "The amount paid can't be more than the purchase total.", code: "overpayment" },
      { status: 400 },
    );
  }

  const problem = await checkReferences(context.organizationId, {
    supplierId: data.supplierId,
    warehouseId: data.warehouseId,
    productIds: data.lines.map((line) => line.productId),
  });

  if (problem) {
    return NextResponse.json({ error: problem.error, code: problem.code }, { status: 400 });
  }

  let id: string;
  try {
    id = await insertPurchase({
      organizationId: context.organizationId,
      userId: context.userId,
      supplierId: data.supplierId,
      warehouseId: data.warehouseId,
      status: data.status ?? "draft",
      orderDate: data.orderDate ?? new Date(),
      expectedDate: data.expectedDate ?? null,
      notes: data.notes ?? null,
      discount,
      tax,
      lines: data.lines,
      amountPaid: roundMoney(amountPaid),
      clientRef,
    });
  } catch (error) {
    // Two copies of the same offline purchase arriving at once: the second
    // loses the unique clientRef race and returns the first.
    const existingId = clientRef ? await findPurchaseByClientRef(context.organizationId, clientRef) : null;
    if (!existingId) throw error;
    return NextResponse.json({
      purchase: await getPurchase(context.organizationId, existingId),
      duplicate: true,
    });
  }

  await logAudit({
    organizationId: context.organizationId,
    userId: context.userId,
    module: "purchase",
    action: "purchase.created",
    recordId: id,
    newValue: { total, lines: data.lines.length, status: data.status ?? "draft", amountPaid },
  });

  if (receive) {
    const outcome = await receivePurchase(
      context,
      id,
      await outstandingLines(context.organizationId, id),
      clientRef ? `${clientRef}:receive` : null,
    );

    if (!outcome.ok) {
      return NextResponse.json(
        {
          ...outcome.body,
          error: `The purchase was saved as a draft, but couldn't be received: ${outcome.body.error}`,
          purchase: await getPurchase(context.organizationId, id),
        },
        { status: outcome.status },
      );
    }
  }

  return NextResponse.json({ purchase: await getPurchase(context.organizationId, id) }, { status: 201 });
}
