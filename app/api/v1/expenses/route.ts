import { NextResponse } from "next/server";
import { guardApi } from "@/lib/api-context";
import { logAudit } from "@/lib/audit";
import {
  checkReferences,
  findExpenseByClientRef,
  getExpense,
  insertExpense,
  listExpenses,
  parseExpenseFields,
} from "@/lib/expenses";
import { isUuid } from "@/lib/validation";

const MAX_LIMIT = 2000;

// Expenses, newest first. Filters: from (inclusive), to (exclusive),
// categoryId, warehouseId, status (recorded | voided), limit.
export async function GET(request: Request) {
  const context = await guardApi(request, "expenses.view");
  if (context instanceof NextResponse) return context;

  const params = new URL(request.url).searchParams;
  const date = (key: string) => {
    const value = params.get(key);
    if (value === null) return undefined;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };
  const from = date("from");
  const to = date("to");
  if (from === null || to === null) {
    return NextResponse.json({ error: "from and to must be dates." }, { status: 400 });
  }
  const categoryId = params.get("categoryId") ?? undefined;
  const warehouseId = params.get("warehouseId") ?? undefined;
  if ((categoryId && !isUuid(categoryId)) || (warehouseId && !isUuid(warehouseId))) {
    return NextResponse.json({ error: "categoryId and warehouseId must be valid ids." }, { status: 400 });
  }
  const status = params.get("status") ?? undefined;
  if (status && status !== "recorded" && status !== "voided") {
    return NextResponse.json({ error: "status must be recorded or voided." }, { status: 400 });
  }
  const requested = Number(params.get("limit"));
  const limit = Number.isInteger(requested) && requested > 0 ? Math.min(requested, MAX_LIMIT) : 500;

  return NextResponse.json({
    expenses: await listExpenses(context.organizationId, { from, to, categoryId, warehouseId, status, limit }),
  });
}

// Records an expense. A clientRef makes a retry (an offline expense sent
// again) return the first instead of recording it twice.
export async function POST(request: Request) {
  const context = await guardApi(request, "expenses.create");
  if (context instanceof NextResponse) return context;

  const body = await request.json().catch(() => null);
  const parsed = parseExpenseFields(body, { creating: true });
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const clientRef = typeof body?.clientRef === "string" && body.clientRef.length <= 100 ? body.clientRef : null;

  if (clientRef) {
    const existing = await findExpenseByClientRef(context.organizationId, clientRef);
    if (existing) {
      return NextResponse.json({ expense: await getExpense(context.organizationId, existing), duplicate: true });
    }
  }

  const problem = await checkReferences(context.organizationId, parsed.data);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  let id: string;
  try {
    id = await insertExpense({
      organizationId: context.organizationId,
      userId: context.userId,
      fields: parsed.data as Parameters<typeof insertExpense>[0]["fields"],
      clientRef,
    });
  } catch (error) {
    // Lost a race with the same clientRef: hand back the one that landed.
    const existing = clientRef ? await findExpenseByClientRef(context.organizationId, clientRef) : null;
    if (!existing) throw error;
    return NextResponse.json({ expense: await getExpense(context.organizationId, existing), duplicate: true });
  }

  const expense = await getExpense(context.organizationId, id);
  await logAudit({
    organizationId: context.organizationId,
    userId: context.userId,
    module: "expense",
    action: "expense.created",
    recordId: id,
    newValue: { reference: expense?.reference, category: expense?.categoryName, amount: expense?.amount },
  });
  return NextResponse.json({ expense }, { status: 201 });
}
