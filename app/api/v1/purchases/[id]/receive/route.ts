import { NextResponse } from "next/server";
import { guardApi } from "@/lib/api-context";
import { outstandingLines, receivePurchase, type ReceiveLine } from "@/lib/purchase-receiving";
import { getPurchase } from "@/lib/purchases";
import { isUuid } from "@/lib/validation";

type Params = { params: Promise<{ id: string }> };

// Records a delivery: { "lines": [{ "lineId", "quantity" }] } for what
// arrived, or { "all": true } for everything still outstanding.
export async function POST(request: Request, { params }: Params) {
  const context = await guardApi(request, "purchases.receive");

  if (context instanceof NextResponse) return context;

  const { id } = await params;

  if (!isUuid(id)) {
    return NextResponse.json({ error: "Purchase not found." }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const clientRef = typeof body?.clientRef === "string" ? body.clientRef : null;

  if (clientRef !== null && (clientRef.length === 0 || clientRef.length > 100)) {
    return NextResponse.json({ error: "clientRef must be 1 to 100 characters." }, { status: 400 });
  }

  let lines: ReceiveLine[];

  if (body?.all === true) {
    lines = await outstandingLines(context.organizationId, id);
    if (lines.length === 0) {
      const exists = await getPurchase(context.organizationId, id);
      return exists
        ? NextResponse.json(
            { error: "Everything on this purchase has already been received.", code: "purchase_not_receivable" },
            { status: 409 },
          )
        : NextResponse.json({ error: "Purchase not found." }, { status: 404 });
    }
  } else if (Array.isArray(body?.lines)) {
    lines = [];
    for (const raw of body.lines) {
      if (!isUuid(raw?.lineId) || !Number.isInteger(raw?.quantity) || raw.quantity <= 0) {
        return NextResponse.json(
          { error: "Each line needs a lineId and a whole-number quantity above 0." },
          { status: 400 },
        );
      }
      lines.push({ lineId: raw.lineId, quantity: raw.quantity });
    }
    if (lines.length === 0) {
      return NextResponse.json({ error: "Say how many of at least one line arrived." }, { status: 400 });
    }
  } else {
    return NextResponse.json({ error: 'Send "lines" or "all": true.' }, { status: 400 });
  }

  const outcome = await receivePurchase(context, id, lines, clientRef);

  if (!outcome.ok) {
    return NextResponse.json(outcome.body, { status: outcome.status });
  }

  return NextResponse.json({
    purchase: await getPurchase(context.organizationId, String(outcome.result.purchaseId)),
    duplicate: outcome.result.duplicate === true,
    priceChanges: outcome.result.priceChanges ?? [],
  });
}
