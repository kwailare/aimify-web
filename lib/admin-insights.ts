import { and, asc, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  auditLogs,
  organizations,
  plans,
  supportMessages,
  supportTickets,
} from "@/db/schema";
import { effectiveStatus } from "@/lib/subscription";

const DAY = 24 * 60 * 60 * 1000;
const MONTHS = 6;
const FALLBACK_PRICE = 25000;

function monthKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthStart(offset: number, now: Date) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1));
}

export async function getInsights(now = new Date()) {
  const since = monthStart(MONTHS - 1, now);
  const monthAgo = new Date(now.getTime() - 30 * DAY);

  const [orgRows, events, ticketRows, replyRows] = await Promise.all([
    db
      .select({
        id: organizations.id,
        createdAt: organizations.createdAt,
        status: organizations.subscriptionStatus,
        trialEndsAt: organizations.trialEndsAt,
        planName: plans.name,
        price: plans.priceMonthly,
      })
      .from(organizations)
      .leftJoin(plans, eq(organizations.planId, plans.id)),
    db
      .select({
        action: auditLogs.action,
        organizationId: auditLogs.organizationId,
        previousValue: auditLogs.previousValue,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .where(
        and(
          gte(auditLogs.createdAt, since),
          inArray(auditLogs.action, [
            "subscription.activated",
            "admin.subscription_activated",
            "subscription.cancelled",
            "subscription.expired",
          ]),
        ),
      )
      .orderBy(asc(auditLogs.createdAt)),
    db
      .select({
        id: supportTickets.id,
        status: supportTickets.status,
        createdAt: supportTickets.createdAt,
        resolvedAt: supportTickets.resolvedAt,
      })
      .from(supportTickets)
      .where(gte(supportTickets.createdAt, since)),
    db
      .select({
        ticketId: supportMessages.ticketId,
        firstReplyAt: sql<Date>`min(${supportMessages.createdAt})`.mapWith(
          supportMessages.createdAt,
        ),
      })
      .from(supportMessages)
      .where(eq(supportMessages.kind, "reply"))
      .groupBy(supportMessages.ticketId),
  ]);

  const priceByOrg = new Map(
    orgRows.map((org) => [org.id, org.price ?? FALLBACK_PRICE]),
  );

  const buckets = Array.from({ length: MONTHS }, (_, index) => {
    const start = monthStart(MONTHS - 1 - index, now);

    return {
      key: monthKey(start),
      label: start.toLocaleDateString("en-US", {
        month: "short",
        year: "2-digit",
        timeZone: "UTC",
      }),
      signups: 0,
      trialsStarted: 0,
      activations: 0,
      cancellations: 0,
      expirations: 0,
    };
  });
  const bucketByKey = new Map(buckets.map((bucket) => [bucket.key, bucket]));

  for (const org of orgRows) {
    const bucket = bucketByKey.get(monthKey(org.createdAt));
    if (bucket) bucket.signups += 1;
  }

  let activations30 = 0;
  let expirations30 = 0;
  let cancelledActive30 = 0;
  let newMrr = 0;
  let churnedMrr = 0;

  for (const event of events) {
    const bucket = bucketByKey.get(monthKey(event.createdAt));
    const recent = event.createdAt >= monthAgo;
    const price = event.organizationId
      ? (priceByOrg.get(event.organizationId) ?? FALLBACK_PRICE)
      : FALLBACK_PRICE;
    const previous = (event.previousValue ?? {}) as { subscriptionStatus?: string };

    if (event.action === "subscription.activated") {
      if (bucket) bucket.trialsStarted += 1;
    } else if (event.action === "admin.subscription_activated") {
      if (bucket) bucket.activations += 1;
      if (recent) {
        activations30 += 1;
        newMrr += price;
      }
    } else if (event.action === "subscription.cancelled") {
      if (bucket) bucket.cancellations += 1;
      if (recent && previous.subscriptionStatus === "active") {
        cancelledActive30 += 1;
        churnedMrr += price;
      }
    } else if (event.action === "subscription.expired") {
      if (bucket) bucket.expirations += 1;
      if (recent) expirations30 += 1;
    }
  }

  let activeNow = 0;
  let mrr = 0;
  const byPlan = new Map<string, { plan: string; organizations: number; mrr: number }>();

  for (const org of orgRows) {
    const status = effectiveStatus(org.status, org.trialEndsAt);
    const name = org.planName ?? "Default plan";
    const entry = byPlan.get(name) ?? { plan: name, organizations: 0, mrr: 0 };

    entry.organizations += 1;

    if (status === "active") {
      const price = org.price ?? FALLBACK_PRICE;
      activeNow += 1;
      mrr += price;
      entry.mrr += price;
    }

    byPlan.set(name, entry);
  }

  const startOfPeriodActive = activeNow + cancelledActive30 - activations30;
  const conversionBase = activations30 + expirations30;

  const firstReply = new Map(replyRows.map((row) => [row.ticketId, row.firstReplyAt]));
  const responseHours: number[] = [];

  for (const ticket of ticketRows) {
    const replyAt = firstReply.get(ticket.id);

    if (replyAt && ticket.createdAt >= monthAgo) {
      responseHours.push((replyAt.getTime() - ticket.createdAt.getTime()) / 3600000);
    }
  }

  const tickets30 = ticketRows.filter((ticket) => ticket.createdAt >= monthAgo);

  return {
    mrr,
    arr: mrr * 12,
    activeNow,
    newMrr,
    churnedMrr,
    netNewMrr: newMrr - churnedMrr,
    activations30,
    cancelledActive30,
    conversionRate:
      conversionBase > 0 ? Math.round((activations30 / conversionBase) * 100) : null,
    churnRate:
      startOfPeriodActive > 0
        ? Math.round((cancelledActive30 / startOfPeriodActive) * 100)
        : null,
    arpa: activeNow > 0 ? Math.round(mrr / activeNow) : null,
    months: buckets,
    byPlan: [...byPlan.values()].sort((a, b) => b.mrr - a.mrr),
    support: {
      opened30: tickets30.length,
      resolved30: ticketRows.filter(
        (ticket) => ticket.resolvedAt && ticket.resolvedAt >= monthAgo,
      ).length,
      avgFirstResponseHours:
        responseHours.length > 0
          ? Math.round(
              (responseHours.reduce((a, b) => a + b, 0) / responseHours.length) * 10,
            ) / 10
          : null,
    },
  };
}
