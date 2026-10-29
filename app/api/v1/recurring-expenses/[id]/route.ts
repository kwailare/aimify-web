import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { expenses, recurringExpenses } from "@/db/schema";
import { guardApi } from "@/lib/api-context";
import { logAudit } from "@/lib/audit";
import { checkReferences, getRecurring, parseRecurringFields } from "@/lib/expenses";

type Params = { params: Promise<{ id: string }> };
const notFound = () => NextResponse.json({ error: "Recurring expense not found." }, { status: 404 });

export async function PATCH(request: Request, { params }: Params) {
  const context = await guardApi(request, "expenses.manage");
  if (context instanceof NextResponse) return context;
  const { id } = await params;
  const before = await getRecurring(context.organizationId, id);
  if (!before) return notFound();
  const parsed = parseRecurringFields(await request.json().catch(() => null), { creating: false });
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  if (parsed.data.description === null) {
    return NextResponse.json({ error: "description can't be empty." }, { status: 400 });
  }
  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: "Send at least one field to change." }, { status: 400 });
  }
  const problem = await checkReferences(context.organizationId, parsed.data);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  await db
    .update(recurringExpenses)
    .set({ ...parsed.data, description: parsed.data.description ?? undefined, updatedAt: new Date() })
    .where(and(eq(recurringExpenses.id, id), eq(recurringExpenses.organizationId, context.organizationId)));
  const after = await getRecurring(context.organizationId, id);
  await logAudit({
    organizationId: context.organizationId,
    userId: context.userId,
    module: "expense",
    action: "recurring_expense.updated",
    recordId: id,
    previousValue: { description: before.description, amount: before.amount, frequency: before.frequency, active: before.active },
    newValue: { description: after?.description, amount: after?.amount, frequency: after?.frequency, active: after?.active },
  });
  return NextResponse.json({ recurring: after });
}

// Removing it stops the reminders; expenses already recorded from it stay.
export async function DELETE(request: Request, { params }: Params) {
  const context = await guardApi(request, "expenses.manage");
  if (context instanceof NextResponse) return context;
  const { id } = await params;
  const before = await getRecurring(context.organizationId, id);
  if (!before) return notFound();
  await db
    .update(expenses)
    .set({ recurringId: null })
    .where(and(eq(expenses.recurringId, id), eq(expenses.organizationId, context.organizationId)));
  await db.delete(recurringExpenses).where(eq(recurringExpenses.id, id));
  await logAudit({
    organizationId: context.organizationId,
    userId: context.userId,
    module: "expense",
    action: "recurring_expense.deleted",
    recordId: id,
    previousValue: { description: before.description },
  });
  return NextResponse.json({ deleted: true });
}
