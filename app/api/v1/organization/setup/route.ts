import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { guardApi } from "@/lib/api-context";
import { logAudit } from "@/lib/audit";

export async function POST(request: Request) {
  const context = await guardApi(request, "setup.complete");

  if (context instanceof NextResponse) return context;

  const [updated] = await db
    .update(organizations)
    .set({ setupCompletedAt: new Date() })
    .where(
      and(
        eq(organizations.id, context.organizationId),
        isNull(organizations.setupCompletedAt),
      ),
    )
    .returning({ setupCompletedAt: organizations.setupCompletedAt });

  if (updated) {
    await logAudit({
      organizationId: context.organizationId,
      userId: context.userId,
      module: "organization",
      action: "organization.setup_completed",
      recordId: context.organizationId,
    });

    return NextResponse.json({ setupCompletedAt: updated.setupCompletedAt });
  }

  const [current] = await db
    .select({ setupCompletedAt: organizations.setupCompletedAt })
    .from(organizations)
    .where(eq(organizations.id, context.organizationId))
    .limit(1);

  return NextResponse.json({ setupCompletedAt: current?.setupCompletedAt ?? null });
}
