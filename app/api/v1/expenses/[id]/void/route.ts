import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { expenses } from "@/db/schema";
import { guardApi } from "@/lib/api-context";
import { logAudit } from "@/lib/audit";
import { getExpense } from "@/lib/expenses";
import { isUuid } from "@/lib/validation";

// Voids an expense recorded by mistake (with a reason); it stays on record
// but no longer counts.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await guardApi(request, "expenses.void");
  if (context instanceof NextResponse) return context;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Expense not found." }, { status: 404 });

  const body = await request.json().catch(() => null);
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
  if (!reason || reason.length > 300) {
    return NextResponse.json({ error: "Give a reason (at most 300 characters)." }, { status: 400 });
  }

  const [voided] = await db
    .update(expenses)
    .set({ status: "voided", voidReason: reason, voidedAt: new Date(), voidedBy: context.userId, updatedAt: new Date() })
    .where(and(eq(expenses.id, id), eq(expenses.organizationId, context.organizationId), eq(expenses.status, "recorded")))
    .returning({ id: expenses.id, reference: expenses.reference, amount: expenses.amount });

  if (!voided) {
    const existing = await getExpense(context.organizationId, id);
    return existing
      ? NextResponse.json({ error: "This expense was already voided.", code: "expense_voided" }, { status: 409 })
      : NextResponse.json({ error: "Expense not found." }, { status: 404 });
  }

  await logAudit({
    organizationId: context.organizationId,
    userId: context.userId,
    module: "expense",
    action: "expense.voided",
    recordId: id,
    newValue: { reference: voided.reference, amount: voided.amount, reason },
  });
  return NextResponse.json({ expense: await getExpense(context.organizationId, id) });
}
