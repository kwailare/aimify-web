import { NextResponse } from "next/server";
import { guardApi } from "@/lib/api-context";
import { logAudit } from "@/lib/audit";
import { type Frequency, getExpense, getRecurring, nextDue, recordRecurring } from "@/lib/expenses";

// Records the occurrence that is due now as an expense (optionally with
// another amount or date) and moves the next due date on. Send the dueDate
// that was shown: if that occurrence has already been recorded (two people,
// or a double click), the answer is 409 already_recorded instead of
// recording the next one too.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await guardApi(request, "expenses.create");
  if (context instanceof NextResponse) return context;
  const { id } = await params;
  const recurring = await getRecurring(context.organizationId, id);
  if (!recurring) return NextResponse.json({ error: "Recurring expense not found." }, { status: 404 });
  if (!recurring.active) {
    return NextResponse.json({ error: "This recurring expense is paused.", code: "recurring_paused" }, { status: 409 });
  }

  const body = (await request.json().catch(() => ({}))) ?? {};
  let amount = recurring.amount;
  if (body.amount !== undefined) {
    if (typeof body.amount !== "number" || !Number.isFinite(body.amount) || body.amount <= 0) {
      return NextResponse.json({ error: "amount must be a number above 0." }, { status: 400 });
    }
    amount = Math.round(body.amount * 100) / 100;
  }
  let expenseDate = new Date();
  if (body.expenseDate !== undefined) {
    const parsed = new Date(body.expenseDate);
    if (Number.isNaN(parsed.getTime())) return NextResponse.json({ error: "expenseDate must be a date." }, { status: 400 });
    expenseDate = parsed;
  }

  const due = new Date(recurring.nextDueDate);
  if (body.dueDate !== undefined) {
    const shown = new Date(body.dueDate);
    if (Number.isNaN(shown.getTime())) return NextResponse.json({ error: "dueDate must be a date." }, { status: 400 });
    if (shown.getTime() !== due.getTime()) {
      return NextResponse.json(
        { error: "That one has already been recorded.", code: "already_recorded" },
        { status: 409 },
      );
    }
  }
  const expenseId = await recordRecurring({
    organizationId: context.organizationId,
    userId: context.userId,
    recurringId: id,
    dueDate: due,
    next: nextDue(due, recurring.frequency as Frequency),
    amount,
    expenseDate,
  });
  if (!expenseId) {
    return NextResponse.json(
      { error: "Someone has just recorded this one.", code: "already_recorded" },
      { status: 409 },
    );
  }
  const expense = await getExpense(context.organizationId, expenseId);
  await logAudit({
    organizationId: context.organizationId,
    userId: context.userId,
    module: "expense",
    action: "expense.created",
    recordId: expenseId,
    newValue: { reference: expense?.reference, category: expense?.categoryName, amount, recurring: recurring.description },
  });
  return NextResponse.json(
    { expense, recurring: await getRecurring(context.organizationId, id) },
    { status: 201 },
  );
}
