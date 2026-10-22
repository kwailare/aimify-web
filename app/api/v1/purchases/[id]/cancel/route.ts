import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { guardApi } from "@/lib/api-context";
import { logAudit } from "@/lib/audit";
import { callPurchaseFunction, getPurchase } from "@/lib/purchases";
import { isUuid } from "@/lib/validation";

type Params = { params: Promise<{ id: string }> };

// Cancels a draft or pending purchase nothing has been received on. Money
// already paid on it becomes a credit with the supplier.
export async function POST(request: Request, { params }: Params) {
  const context = await guardApi(request, "purchases.cancel");

  if (context instanceof NextResponse) return context;

  const { id } = await params;

  if (!isUuid(id)) {
    return NextResponse.json({ error: "Purchase not found." }, { status: 404 });
  }

  const outcome = await callPurchaseFunction(sql`
    SELECT aimify_cancel_purchase(${context.organizationId}, ${id}, ${context.userId}) AS "result"
  `);

  if (!outcome.ok) {
    return NextResponse.json(outcome.body, { status: outcome.status });
  }

  await logAudit({
    organizationId: context.organizationId,
    userId: context.userId,
    module: "purchase",
    action: "purchase.cancelled",
    recordId: id,
    newValue: { refundOwed: outcome.result.refundOwed },
  });

  return NextResponse.json({
    purchase: await getPurchase(context.organizationId, id),
    refundOwed: outcome.result.refundOwed,
  });
}
