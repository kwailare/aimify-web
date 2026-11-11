import { and, desc, eq, gt, inArray, isNotNull, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  creditEntries,
  customers,
  memberships,
  organizations,
  products,
  purchaseLines,
  purchases,
  sales,
  suppliers,
  users,
  whatsappMessages,
} from "@/db/schema";
import { TEMPLATE_LANGUAGE, whatsappProvider } from "@/lib/whatsapp";
import {
  type BuiltMessage,
  invoiceMessage,
  purchaseOrderMessage,
  receiptMessage,
  reminderMessage,
  stockAlertMessage,
} from "@/lib/whatsapp/messages";
import { toWhatsAppNumber } from "@/lib/whatsapp/phone";
import { type WhatsAppSettings, readWhatsAppSettings } from "@/lib/whatsapp/settings";

// The automatic WhatsApp messages. Each one goes only when WhatsApp is set
// up, the business has that kind turned on, and the recipient agreed (a
// customer's or supplier's "WhatsApp OK", a team member's own choice) and
// has a usable phone number. Each is logged, once (dedupeKey).

export type SendOutcome = "sent" | "recorded" | "failed" | "duplicate" | "skipped";

async function business(organizationId: string) {
  const [org] = await db
    .select({ name: organizations.name, settings: organizations.whatsappSettings })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);
  return org ? { name: org.name, settings: readWhatsAppSettings(org.settings) } : null;
}

async function send(entry: {
  organizationId: string;
  kind: "invoice" | "receipt" | "reminder" | "purchase_order" | "stock_alert";
  phone: string | null;
  partyType?: "customer" | "supplier";
  partyId?: string;
  userId?: string;
  recordId?: string;
  dedupeKey: string;
  message: BuiltMessage;
}): Promise<SendOutcome> {
  const provider = whatsappProvider();
  const to = toWhatsAppNumber(entry.phone);
  if (!provider || !to) return "skipped";

  const [row] = await db
    .insert(whatsappMessages)
    .values({
      organizationId: entry.organizationId,
      kind: entry.kind,
      toPhone: to,
      partyType: entry.partyType ?? null,
      partyId: entry.partyId ?? null,
      userId: entry.userId ?? null,
      recordId: entry.recordId ?? null,
      dedupeKey: entry.dedupeKey,
      provider: provider.id,
      template: entry.message.template,
      body: entry.message.text,
    })
    .onConflictDoNothing()
    .returning({ id: whatsappMessages.id });
  if (!row) return "duplicate";

  try {
    const result = await provider.send({
      to,
      template: entry.message.template,
      params: entry.message.params,
      language: TEMPLATE_LANGUAGE(),
    });
    await db
      .update(whatsappMessages)
      .set({ status: result.status, providerMessageId: result.messageId, updatedAt: new Date() })
      .where(eq(whatsappMessages.id, row.id));
    return result.status;
  } catch (error) {
    await db
      .update(whatsappMessages)
      .set({
        status: "failed",
        error: (error instanceof Error ? error.message : "send_failed").slice(0, 300),
        updatedAt: new Date(),
      })
      .where(eq(whatsappMessages.id, row.id));
    return "failed";
  }
}

const on = (settings: WhatsAppSettings, key: keyof WhatsAppSettings) => settings[key] === true;

/** The invoice, to the customer, after a sale. */
export async function notifyInvoice(organizationId: string, saleId: string) {
  const biz = await business(organizationId);
  if (!biz || !on(biz.settings, "invoices") || !whatsappProvider()) return "skipped" as const;
  const [row] = await db
    .select({
      reference: sales.reference,
      total: sales.total,
      paid: sales.amountPaid,
      customerId: customers.id,
      name: customers.name,
      phone: customers.phone,
      optIn: customers.whatsappOptIn,
      walkInPhone: sales.customerPhone,
    })
    .from(sales)
    .leftJoin(customers, eq(customers.id, sales.customerId))
    .where(and(eq(sales.id, saleId), eq(sales.organizationId, organizationId)))
    .limit(1);
  if (!row) return "skipped" as const;
  // A customer who agreed, or a walk-in who gave their number for it.
  const walkIn = row.customerId === null;
  if (walkIn ? !row.walkInPhone : !row.optIn) return "skipped" as const;
  return send({
    organizationId,
    kind: "invoice",
    phone: walkIn ? row.walkInPhone : row.phone,
    partyType: walkIn ? undefined : "customer",
    partyId: row.customerId ?? undefined,
    recordId: saleId,
    dedupeKey: `invoice:${saleId}`,
    message: invoiceMessage({ customer: row.name ?? "there", business: biz.name, reference: row.reference, total: row.total, paid: row.paid }),
  });
}

/**
 * A receipt, to the customer, after they pay: [reference] is the receipt
 * (RCPT-0001) or the invoice the payment was for; [recordId] the payment.
 */
export async function notifyReceipt(
  organizationId: string,
  payment: { customerId: string; amount: number; reference: string; recordId: string },
) {
  const biz = await business(organizationId);
  if (!biz || !on(biz.settings, "receipts") || !whatsappProvider()) return "skipped" as const;
  const [customer] = await db
    .select({ name: customers.name, phone: customers.phone, optIn: customers.whatsappOptIn, balance: customers.balance })
    .from(customers)
    .where(and(eq(customers.id, payment.customerId), eq(customers.organizationId, organizationId)))
    .limit(1);
  if (!customer?.optIn) return "skipped" as const;
  return send({
    organizationId,
    kind: "receipt",
    phone: customer.phone,
    partyType: "customer",
    partyId: payment.customerId,
    recordId: payment.recordId,
    dedupeKey: `receipt:${payment.recordId}`,
    message: receiptMessage({
      customer: customer.name,
      business: biz.name,
      amount: payment.amount,
      reference: payment.reference,
      balance: customer.balance,
    }),
  });
}

/** The purchase order, to the supplier, once it is placed (ordered). */
export async function notifyPurchaseOrder(organizationId: string, purchaseId: string) {
  const biz = await business(organizationId);
  if (!biz || !on(biz.settings, "purchaseOrders") || !whatsappProvider()) return "skipped" as const;
  const [row] = await db
    .select({
      reference: purchases.reference,
      total: purchases.total,
      status: purchases.status,
      supplierId: suppliers.id,
      name: suppliers.name,
      phone: suppliers.phone,
      optIn: suppliers.whatsappOptIn,
    })
    .from(purchases)
    .innerJoin(suppliers, eq(suppliers.id, purchases.supplierId))
    .where(and(eq(purchases.id, purchaseId), eq(purchases.organizationId, organizationId)))
    .limit(1);
  if (!row?.optIn || row.status !== "pending") return "skipped" as const;
  const lines = await db
    .select({ name: products.name, unit: products.unit, quantity: purchaseLines.quantity })
    .from(purchaseLines)
    .innerJoin(products, eq(products.id, purchaseLines.productId))
    .where(eq(purchaseLines.purchaseId, purchaseId))
    .orderBy(purchaseLines.position);
  return send({
    organizationId,
    kind: "purchase_order",
    phone: row.phone,
    partyType: "supplier",
    partyId: row.supplierId,
    recordId: purchaseId,
    dedupeKey: `purchase_order:${purchaseId}`,
    message: purchaseOrderMessage({ supplier: row.name, business: biz.name, reference: row.reference, lines, total: row.total }),
  });
}

/** A low or out of stock alert, to each team member who asked for them. */
export async function notifyStockAlertOnWhatsApp(
  organizationId: string,
  alert: "low_stock" | "out_of_stock",
  product: { productId: string; name: string; sku: string; currentStock: number; minStock: number },
  now = new Date(),
) {
  const biz = await business(organizationId);
  if (!biz || !on(biz.settings, "stockAlerts") || !whatsappProvider()) return [];
  const team = await db
    .select({ id: users.id, phone: users.phone })
    .from(memberships)
    .innerJoin(users, eq(memberships.userId, users.id))
    .where(and(eq(memberships.organizationId, organizationId), eq(users.whatsappAlerts, true), isNotNull(users.phone)));
  const today = now.toISOString().slice(0, 10);
  const message = stockAlertMessage({
    business: biz.name,
    product: product.name,
    sku: product.sku,
    out: alert === "out_of_stock",
    left: product.currentStock,
    minimum: product.minStock,
  });
  const outcomes: SendOutcome[] = [];
  for (const person of team) {
    outcomes.push(
      await send({
        organizationId,
        kind: "stock_alert",
        phone: person.phone,
        userId: person.id,
        recordId: product.productId,
        // At most one of each alert per product, person and day.
        dedupeKey: `stock_alert:${product.productId}:${alert}:${person.id}:${today}`,
        message,
      }),
    );
  }
  return outcomes;
}

/**
 * Reminders of overdue amounts, to customers who agreed, for every
 * business with reminders on: a customer with something past due is
 * reminded when they have not been for `reminderEveryDays`. Run daily.
 */
export async function runWhatsAppReminders(now = new Date()) {
  const summary = { businesses: 0, sent: 0, failed: 0, skipped: 0 };
  if (!whatsappProvider()) return summary;
  const orgs = await db
    .select({ id: organizations.id, name: organizations.name, settings: organizations.whatsappSettings })
    .from(organizations)
    .where(
      and(
        sql`(${organizations.whatsappSettings}->>'reminders')::boolean = true`,
        inArray(organizations.subscriptionStatus, ["trial", "active", "past_due"]),
      ),
    );
  const today = now.toISOString().slice(0, 10);
  for (const org of orgs) {
    summary.businesses += 1;
    const settings = readWhatsAppSettings(org.settings);
    const overdue = await db
      .select({
        customerId: customers.id,
        name: customers.name,
        phone: customers.phone,
        amount: sql<number>`sum(${creditEntries.openAmount})::float8`,
        oldest: sql<Date>`min(${creditEntries.dueDate})`,
      })
      .from(creditEntries)
      .innerJoin(customers, eq(customers.id, creditEntries.partyId))
      .where(
        and(
          eq(creditEntries.organizationId, org.id),
          eq(creditEntries.partyType, "customer"),
          gt(creditEntries.openAmount, 0),
          lt(creditEntries.dueDate, now),
          eq(customers.whatsappOptIn, true),
          eq(customers.status, "active"),
        ),
      )
      .groupBy(customers.id, customers.name, customers.phone);
    for (const c of overdue) {
      const [last] = await db
        .select({ at: whatsappMessages.createdAt })
        .from(whatsappMessages)
        .where(
          and(
            eq(whatsappMessages.organizationId, org.id),
            eq(whatsappMessages.kind, "reminder"),
            eq(whatsappMessages.partyId, c.customerId),
          ),
        )
        .orderBy(desc(whatsappMessages.createdAt))
        .limit(1);
      if (last && now.getTime() - last.at.getTime() < settings.reminderEveryDays * 86_400_000 - 3_600_000) {
        summary.skipped += 1;
        continue;
      }
      const outcome = await send({
        organizationId: org.id,
        kind: "reminder",
        phone: c.phone,
        partyType: "customer",
        partyId: c.customerId,
        dedupeKey: `reminder:${c.customerId}:${today}`,
        message: reminderMessage({ customer: c.name, business: org.name, overdue: c.amount, oldestDue: new Date(c.oldest) }),
      });
      if (outcome === "sent" || outcome === "recorded") summary.sent += 1;
      else if (outcome === "failed") summary.failed += 1;
      else summary.skipped += 1;
    }
  }
  return summary;
}
