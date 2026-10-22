import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { denyIfForbidden, guardApi } from "@/lib/api-context";
import { logAudit } from "@/lib/audit";
import { callPurchaseFunction, getPurchase } from "@/lib/purchases";
import { isUuid } from "@/lib/validation";

type Params = { params: Promise<{ id: string }> };

// Records money paid on a purchase. Once the purchase has been received it
// is also a payment on the supplier's credit ledger.
export async function POST(request: Request, { params }: Params) {
  const context = await guardApi(request, "purchases.view");

  if (context instanceof NextResponse) return context;

  const denied = denyIfForbidden(context, "credit.record");

  if (denied) return denied;

  const { id } = await params;

  if (!isUuid(id)) {
    return NextResponse.json({ error: "Purchase not found." }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const amount = body?.amount;
  const note = typeof body?.note === "string" ? body.note.trim() : null;
  const clientRef = typeof body?.clientRef === "string" ? body.clientRef : null;

  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "amount must be a number above 0." }, { status: 400 });
  }

  if (note && note.length > 500) {
    return NextResponse.json({ error: "note must be at most 500 characters." }, { status: 400 });
  }

  if (clientRef !== null && (clientRef.length === 0 || clientRef.length > 100)) {
    return NextResponse.json({ error: "clientRef must be 1 to 100 characters." }, { status: 400 });
  }

  const outcome = await callPurchaseFunction(sql`
    SELECT aimify_pay_purchase(
      ${context.organizationId}, ${id}, ${context.userId}, ${amount}, ${note || null}, ${clientRef}
    ) AS "result"
  `);

  if (!outcome.ok) {
    return NextResponse.json(outcome.body, { status: outcome.status });
  }

  if (!outcome.result.duplicate) {
    await logAudit({
      organizationId: context.organizationId,
      userId: context.userId,
      module: "purchase",
      action: "purchase.payment",
      recordId: id,
      newValue: { amount, amountPaid: outcome.result.amountPaid, posted: outcome.result.posted },
    });
  }

  return NextResponse.json(
    {
      purchase: await getPurchase(context.organizationId, String(outcome.result.purchaseId)),
      duplicate: outcome.result.duplicate === true,
    },
    { status: outcome.result.duplicate ? 200 : 201 },
  );
}
