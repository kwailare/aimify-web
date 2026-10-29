import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { expenseCategories } from "@/db/schema";
import { guardApi } from "@/lib/api-context";
import { logAudit } from "@/lib/audit";
import { categoryNameTaken, categoryUsage, parseCategoryFields, shapeCategory } from "@/lib/expenses";
import { isUuid } from "@/lib/validation";

type Params = { params: Promise<{ id: string }> };
const notFound = () => NextResponse.json({ error: "Category not found." }, { status: 404 });

async function find(organizationId: string, id: string) {
  if (!isUuid(id)) return null;
  const [row] = await db
    .select()
    .from(expenseCategories)
    .where(and(eq(expenseCategories.id, id), eq(expenseCategories.organizationId, organizationId)))
    .limit(1);
  return row ?? null;
}

// Rename, or set the monthly budget (0 for none).
export async function PATCH(request: Request, { params }: Params) {
  const context = await guardApi(request, "expenses.manage");
  if (context instanceof NextResponse) return context;
  const { id } = await params;
  const before = await find(context.organizationId, id);
  if (!before) return notFound();
  const parsed = parseCategoryFields(await request.json().catch(() => null));
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: "Send name or monthlyBudget." }, { status: 400 });
  }
  if (parsed.data.name && (await categoryNameTaken(context.organizationId, parsed.data.name, id))) {
    return NextResponse.json({ error: "This category already exists." }, { status: 409 });
  }
  const [updated] = await db
    .update(expenseCategories)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(expenseCategories.id, id))
    .returning();
  await logAudit({
    organizationId: context.organizationId,
    userId: context.userId,
    module: "expense",
    action: "expense_category.updated",
    recordId: id,
    previousValue: { name: before.name, monthlyBudget: before.monthlyBudget },
    newValue: { name: updated.name, monthlyBudget: updated.monthlyBudget },
  });
  return NextResponse.json({ category: shapeCategory(updated) });
}

// A category with expenses or recurring expenses can't be removed.
export async function DELETE(request: Request, { params }: Params) {
  const context = await guardApi(request, "expenses.manage");
  if (context instanceof NextResponse) return context;
  const { id } = await params;
  const category = await find(context.organizationId, id);
  if (!category) return notFound();
  const used = await categoryUsage(context.organizationId, id);
  if (used > 0) {
    return NextResponse.json(
      {
        error: `${used} expense${used === 1 ? " uses" : "s use"} this category. Move them to another first.`,
        code: "category_in_use",
        count: used,
      },
      { status: 409 },
    );
  }
  await db.delete(expenseCategories).where(eq(expenseCategories.id, id));
  await logAudit({
    organizationId: context.organizationId,
    userId: context.userId,
    module: "expense",
    action: "expense_category.deleted",
    recordId: id,
    previousValue: { name: category.name },
  });
  return NextResponse.json({ deleted: true });
}
