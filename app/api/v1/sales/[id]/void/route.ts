import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { guardApi } from "@/lib/api-context";
import { logAudit } from "@/lib/audit";
import { callSaleFunction, getSale } from "@/lib/sales";
import { isUuid } from "@/lib/validation";

type Params = { params: Promise<{ id: string }> };

// Voids a sale recorded by mistake: the stock goes back to its warehouse and
// the sale comes off the customer's account. Money already paid becomes a
// credit owed back to the customer.
export async function POST(request: Request, { params }: Params) {
  const context = await guardApi(request, "sales.void");

  if (context instanceof NextResponse) return context;

  const { id } = await params;

  if (!isUuid(id)) {
    return NextResponse.json({ error: "Sale not found." }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";

  if (reason.length === 0 || reason.length > 300) {
    return NextResponse.json({ error: "Give a reason for voiding the sale (up to 300 characters)." }, { status: 400 });
  }

  const outcome = await callSaleFunction(sql`
    SELECT aimify_void_sale(${context.organizationId}, ${id}, ${context.userId}, ${reason}) AS "result"
  `);

  if (!outcome.ok) {
    return NextResponse.json(outcome.body, { status: outcome.status });
  }

  await logAudit({
    organizationId: context.organizationId,
    userId: context.userId,
    module: "sale",
    action: "sale.voided",
    recordId: id,
    newValue: {
      reason,
      refundOwed: outcome.result.refundOwed,
      creditedToAccount: outcome.result.creditedToAccount,
    },
  });

  return NextResponse.json({
    sale: await getSale(context.organizationId, id),
    refundOwed: outcome.result.refundOwed,
    // Paid on the sale but used to settle the customer's other debts.
    creditedToAccount: outcome.result.creditedToAccount ?? 0,
  });
}
