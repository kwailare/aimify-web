import { NextResponse } from "next/server";
import { db } from "@/db";
import { recurringExpenses } from "@/db/schema";
import { guardApi } from "@/lib/api-context";
import { logAudit } from "@/lib/audit";
import { checkReferences, getRecurring, listRecurring, parseRecurringFields } from "@/lib/expenses";

// Expenses that come round again. Seeing and recording them needs
// expenses.create (the due list sits on the Expenses screen); adding,
// changing and removing them needs expenses.manage.
export async function GET(request: Request) {
  const context = await guardApi(request, "expenses.create");
  if (context instanceof NextResponse) return context;
  return NextResponse.json({ recurring: await listRecurring(context.organizationId) });
}

export async function POST(request: Request) {
  const context = await guardApi(request, "expenses.manage");
  if (context instanceof NextResponse) return context;
  const parsed = parseRecurringFields(await request.json().catch(() => null), { creating: true });
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const problem = await checkReferences(context.organizationId, parsed.data);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  const d = parsed.data;
  const [created] = await db
    .insert(recurringExpenses)
    .values({
      organizationId: context.organizationId,
      categoryId: d.categoryId!,
      description: d.description!,
      amount: d.amount!,
      paymentMethod: d.paymentMethod ?? "cash",
      warehouseId: d.warehouseId ?? null,
      payee: d.payee ?? null,
      frequency: d.frequency!,
      nextDueDate: d.nextDueDate!,
      active: d.active ?? true,
      createdBy: context.userId,
    })
    .returning({ id: recurringExpenses.id });
  await logAudit({
    organizationId: context.organizationId,
    userId: context.userId,
    module: "expense",
    action: "recurring_expense.created",
    recordId: created.id,
    newValue: { description: d.description, amount: d.amount, frequency: d.frequency },
  });
  return NextResponse.json({ recurring: await getRecurring(context.organizationId, created.id) }, { status: 201 });
}
