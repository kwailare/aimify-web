import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { organizations, payments } from "@/db/schema";

const DAY = 24 * 60 * 60 * 1000;

export async function getPaymentsOverview(now = new Date()) {
  const monthAgo = new Date(now.getTime() - 30 * DAY);

  const [rows, [totals]] = await Promise.all([
    db
      .select({
        id: payments.id,
        organizationName: organizations.name,
        amount: payments.amount,
        currency: payments.currency,
        status: payments.status,
        kind: payments.kind,
        channel: payments.channel,
        reference: payments.providerReference,
        failureReason: payments.failureReason,
        paidAt: payments.paidAt,
        periodEnd: payments.periodEnd,
        createdAt: payments.createdAt,
      })
      .from(payments)
      .innerJoin(organizations, eq(payments.organizationId, organizations.id))
      .orderBy(desc(payments.createdAt))
      .limit(200),
    db
      .select({
        collectedAll: sql<number>`coalesce(sum(${payments.amount}) filter (where ${payments.status} = 'succeeded'), 0)::float8`,
        collected30: sql<number>`coalesce(sum(${payments.amount}) filter (where ${payments.status} = 'succeeded' and ${payments.paidAt} >= ${monthAgo.toISOString()}), 0)::float8`,
        succeeded30: sql<number>`count(*) filter (where ${payments.status} = 'succeeded' and ${payments.paidAt} >= ${monthAgo.toISOString()})::int`,
        failed30: sql<number>`count(*) filter (where ${payments.status} = 'failed' and ${payments.createdAt} >= ${monthAgo.toISOString()})::int`,
        refunded30: sql<number>`coalesce(sum(${payments.amount}) filter (where ${payments.status} = 'refunded' and ${payments.createdAt} >= ${monthAgo.toISOString()}), 0)::float8`,
      })
      .from(payments),
  ]);

  return { rows, totals };
}

export async function getCollected30(now = new Date()) {
  const [row] = await db
    .select({
      value: sql<number>`coalesce(sum(${payments.amount}), 0)::float8`,
    })
    .from(payments)
    .where(
      and(
        eq(payments.status, "succeeded"),
        gte(payments.paidAt, new Date(now.getTime() - 30 * DAY)),
      ),
    );

  return row?.value ?? 0;
}
