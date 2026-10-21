import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { suppliers } from "@/db/schema";
import { denyIfForbidden, guardApi } from "@/lib/api-context";

// Supplier names only, for showing and picking a product's supplier. Anyone
// who can see products may read it; balances and contact details stay
// behind suppliers.view.
export async function GET(request: Request) {
  const context = await guardApi(request);

  if (context instanceof NextResponse) return context;

  if (!context.permissions.has("suppliers.view")) {
    const denied = denyIfForbidden(context, "products.view");
    if (denied) return denied;
  }

  const rows = await db
    .select({ id: suppliers.id, name: suppliers.name, status: suppliers.status })
    .from(suppliers)
    .where(eq(suppliers.organizationId, context.organizationId))
    .orderBy(asc(suppliers.name));

  return NextResponse.json({ suppliers: rows });
}
