import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { warehouses } from "@/db/schema";
import { getApiOrgContext } from "@/lib/api-context";

export async function GET(request: Request) {
  const context = await getApiOrgContext(request);

  if (!context) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const rows = await db
    .select()
    .from(warehouses)
    .where(eq(warehouses.organizationId, context.organizationId));

  return NextResponse.json({ warehouses: rows });
}
