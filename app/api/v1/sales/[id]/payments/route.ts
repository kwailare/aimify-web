import { NextResponse, after } from "next/server";
import { sql } from "drizzle-orm";
import { denyIfForbidden, guardApi } from "@/lib/api-context";
import { logAudit } from "@/lib/audit";
import { PAYMENT_METHODS, callSaleFunction, getSale, isPaymentMethod } from "@/lib/sales";
import { isUuid } from "@/lib/validation";
import { notifyReceipt } from "@/lib/whatsapp/notify";

type Params = { params: Promise<{ id: string }> };

// Records money received against a sale's balance; it is also a payment on
// the customer's account.
export async function POST(request: Request, { params }: Params) {
  const context = await guardApi(request, "sales.view");

  if (context instanceof NextResponse) return context;

  const denied = denyIfForbidden(context, "credit.record");

  if (denied) return denied;

  const { id } = await params;

  if (!isUuid(id)) {
    return NextResponse.json({ error: "Sale not found." }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const amount = body?.amount;
  const method = body?.method ?? "cash";
  const note = typeof body?.note === "string" ? body.note.trim() : null;
  const clientRef = typeof body?.clientRef === "string" ? body.clientRef : null;

  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "amount must be a number above 0." }, { status: 400 });
  }
  if (!isPaymentMethod(method)) {
    return NextResponse.json({ error: `method must be one of: ${PAYMENT_METHODS.join(", ")}.` }, { status: 400 });
  }
  if (note && note.length > 500) {
    return NextResponse.json({ error: "note must be at most 500 characters." }, { status: 400 });
  }
  if (clientRef !== null && (clientRef.length === 0 || clientRef.length > 100)) {
    return NextResponse.json({ error: "clientRef must be 1 to 100 characters." }, { status: 400 });
  }

  const outcome = await callSaleFunction(sql`
    SELECT aimify_pay_sale(
      ${context.organizationId}, ${id}, ${context.userId}, ${amount}, ${method}, ${note || null}, ${clientRef}
    ) AS "result"
  `);

  if (!outcome.ok) {
    return NextResponse.json(outcome.body, { status: outcome.status });
  }

  if (!outcome.result.duplicate) {
    await logAudit({
      organizationId: context.organizationId,
      userId: context.userId,
      module: "sale",
      action: "sale.payment",
      recordId: id,
      newValue: { amount, method, amountPaid: outcome.result.amountPaid },
    });
  }

  const sale = await getSale(context.organizationId, String(outcome.result.saleId));
  // A receipt on WhatsApp, if the business sends them and the customer agreed.
  const customerId = sale?.customerId;
  if (!outcome.result.duplicate && sale && customerId && outcome.result.paymentId) {
    after(() => notifyReceipt(context.organizationId, {
        customerId,
        amount,
        reference: `payment on ${sale.reference}`,
        recordId: String(outcome.result.paymentId),
      }).catch((error) => console.error("whatsapp", error)));
  }

  return NextResponse.json(
    {
      sale,
      duplicate: outcome.result.duplicate === true,
    },
    { status: outcome.result.duplicate ? 200 : 201 },
  );
}
