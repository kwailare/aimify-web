import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { expenses } from "@/db/schema";
import { guardApi } from "@/lib/api-context";
import { logAudit } from "@/lib/audit";
import { checkReferences, getExpense, parseExpenseFields } from "@/lib/expenses";

type Params = { params: Promise<{ id: string }> };
const notFound = () => NextResponse.json({ error: "Expense not found." }, { status: 404 });

export async function GET(request: Request, { params }: Params) {
  const context = await guardApi(request, "expenses.view");
  if (context instanceof NextResponse) return context;
  const expense = await getExpense(context.organizationId, (await params).id);
  return expense ? NextResponse.json({ expense }) : notFound();
}

// Changes an expense. A voided one can't be changed. Who changed it and when
// is kept on the expense; what changed is in the audit log.
export async function PATCH(request: Request, { params }: Params) {
  const context = await guardApi(request, "expenses.edit");
  if (context instanceof NextResponse) return context;
  const { id } = await params;
  const before = await getExpense(context.organizationId, id);
  if (!before) return notFound();
  if (before.status === "voided") {
    return NextResponse.json({ error: "A voided expense can't be changed.", code: "expense_voided" }, { status: 409 });
  }

  const parsed = parseExpenseFields(await request.json().catch(() => null), { creating: false });
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: "Send at least one field to change." }, { status: 400 });
  }
  const problem = await checkReferences(context.organizationId, parsed.data);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  await db
    .update(expenses)
    .set({ ...parsed.data, updatedBy: context.userId, updatedAt: new Date() })
    .where(and(eq(expenses.id, id), eq(expenses.organizationId, context.organizationId)));
  const after = (await getExpense(context.organizationId, id))!;

  const previousValue: Record<string, unknown> = {};
  const newValue: Record<string, unknown> = {};
  const keys = Object.keys(parsed.data) as (keyof typeof parsed.data)[];
  for (const key of keys) {
    const b = before[key as keyof typeof before];
    const a = after[key as keyof typeof after];
    if (JSON.stringify(b) !== JSON.stringify(a)) {
      previousValue[key] = b;
      newValue[key] = a;
    }
  }
  await logAudit({
    organizationId: context.organizationId,
    userId: context.userId,
    module: "expense",
    action: "expense.updated",
    recordId: id,
    previousValue: { reference: before.reference, ...previousValue },
    newValue,
  });
  return NextResponse.json({ expense: after });
}
