import { NextResponse } from "next/server";
import { db } from "@/db";
import { expenseCategories } from "@/db/schema";
import { guardApi } from "@/lib/api-context";
import { logAudit } from "@/lib/audit";
import { categoryNameTaken, listCategories, parseCategoryFields, shapeCategory } from "@/lib/expenses";

// Anyone who can record or see expenses reads the categories (the form
// picks one); Owners and Administrators manage them (expenses.manage).
export async function GET(request: Request) {
  const context = await guardApi(request);
  if (context instanceof NextResponse) return context;
  if (!context.permissions.has("expenses.view") && !context.permissions.has("expenses.create")) {
    return NextResponse.json(
      { error: "Your role can't see expenses.", code: "forbidden_role", permission: "expenses.view" },
      { status: 403 },
    );
  }
  return NextResponse.json({ categories: await listCategories(context.organizationId) });
}

export async function POST(request: Request) {
  const context = await guardApi(request, "expenses.manage");
  if (context instanceof NextResponse) return context;
  const parsed = parseCategoryFields(await request.json().catch(() => null));
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { name, monthlyBudget = 0 } = parsed.data;
  if (!name) return NextResponse.json({ error: "name is required." }, { status: 400 });
  if (await categoryNameTaken(context.organizationId, name)) {
    return NextResponse.json({ error: "This category already exists." }, { status: 409 });
  }
  const [created] = await db
    .insert(expenseCategories)
    .values({ organizationId: context.organizationId, name, monthlyBudget })
    .returning();
  await logAudit({
    organizationId: context.organizationId,
    userId: context.userId,
    module: "expense",
    action: "expense_category.created",
    recordId: created.id,
    newValue: { name, monthlyBudget },
  });
  return NextResponse.json({ category: shapeCategory(created) }, { status: 201 });
}
