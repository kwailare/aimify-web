import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { purchaseLines } from "@/db/schema";
import type { ApiOrgContext } from "@/lib/api-context";
import { logAudit } from "@/lib/audit";
import { callPurchaseFunction } from "@/lib/purchases";

export type ReceiveLine = { lineId: string; quantity: number };

// Everything still outstanding on a purchase, line by line.
export async function outstandingLines(organizationId: string, purchaseId: string): Promise<ReceiveLine[]> {
  const rows = await db
    .select({
      lineId: purchaseLines.id,
      quantity: sql<number>`${purchaseLines.quantity} - ${purchaseLines.receivedQuantity}`,
    })
    .from(purchaseLines)
    .where(and(eq(purchaseLines.organizationId, organizationId), eq(purchaseLines.purchaseId, purchaseId)));
  return rows.map((row) => ({ lineId: row.lineId, quantity: Number(row.quantity) })).filter((row) => row.quantity > 0);
}

// Receives [lines] on a purchase and records it in the audit trail,
// including any product whose purchase price moved to the cost just paid.
export async function receivePurchase(
  context: ApiOrgContext,
  purchaseId: string,
  lines: ReceiveLine[],
  clientRef: string | null,
) {
  const outcome = await callPurchaseFunction(sql`
    SELECT aimify_receive_purchase(
      ${context.organizationId}, ${purchaseId}, ${context.userId},
      ${JSON.stringify(lines)}::jsonb, ${clientRef}
    ) AS "result"
  `);

  if (!outcome.ok || outcome.result.duplicate) return outcome;

  const received = lines.reduce((sum, line) => sum + line.quantity, 0);
  await logAudit({
    organizationId: context.organizationId,
    userId: context.userId,
    module: "purchase",
    action: "purchase.received",
    recordId: purchaseId,
    newValue: { units: received, lines: lines.length, status: outcome.result.status, posted: outcome.result.posted },
  });

  const priceChanges = (outcome.result.priceChanges ?? []) as {
    productId: string;
    previous: number;
    new: number;
  }[];
  for (const change of priceChanges) {
    await logAudit({
      organizationId: context.organizationId,
      userId: context.userId,
      module: "product",
      action: "product.updated",
      recordId: change.productId,
      previousValue: { purchasePrice: Number(change.previous) },
      newValue: { purchasePrice: Number(change.new), reason: "Received on a purchase" },
    });
  }

  return outcome;
}
