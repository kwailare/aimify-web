"use server";

import { and, eq, or } from "drizzle-orm";
import { headers } from "next/headers";
import { auth } from "@/auth";
import { db } from "@/db";
import { supportMessages, supportTickets, users } from "@/db/schema";
import { logAudit } from "@/lib/audit";
import { sendEmail } from "@/lib/email";
import { getOrgContext } from "@/lib/org";
import { getClientIp, isRateLimited, recordLoginAttempt } from "@/lib/rate-limit";
import { SITE_URL } from "@/lib/site";
import {
  LIMITS,
  SUPPORT_INBOX,
  createTicket,
  validateTicketInput,
} from "@/lib/support";

export async function createSupportTicketAction(subject: string, message: string) {
  const context = await getOrgContext();

  if (!context) return { error: "You need to sign in first." };

  const cleanSubject = String(subject ?? "").trim();
  const cleanMessage = String(message ?? "").trim();
  const invalid = validateTicketInput({
    name: context.user.name,
    email: context.user.email,
    subject: cleanSubject,
    message: cleanMessage,
  });

  if (invalid) return { error: invalid };

  const ip = getClientIp(await headers());
  const identifiers = [`support-user:${context.user.id}`, `contact-ip:${ip}`];

  if (await isRateLimited(identifiers)) {
    return { error: "You've sent several messages recently. Please wait a few minutes." };
  }

  await recordLoginAttempt(identifiers, false);

  const ticket = await createTicket({
    name: context.user.name,
    email: context.user.email,
    subject: cleanSubject,
    message: cleanMessage,
    source: "dashboard",
    userId: context.user.id,
    organizationId: context.membership?.organization.id ?? null,
  });

  return { success: true, reference: ticket.reference };
}

export async function addCustomerMessageAction(ticketId: string, body: string) {
  const session = await auth();

  if (!session?.user?.id) return { error: "You need to sign in first." };

  const text = String(body ?? "").trim();

  if (!text) return { error: "Write a message first." };

  if (text.length > LIMITS.message) {
    return {
      error: `Message must be at most ${LIMITS.message.toLocaleString("en-US")} characters.`,
    };
  }

  const [user] = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  if (!user) return { error: "You need to sign in first." };

  const [ticket] = await db
    .select()
    .from(supportTickets)
    .where(
      and(
        eq(supportTickets.id, ticketId),
        or(
          eq(supportTickets.userId, user.id),
          and(
            eq(supportTickets.email, user.email.toLowerCase()),
            eq(supportTickets.source, "contact_form"),
          ),
        ),
      ),
    )
    .limit(1);

  if (!ticket) return { error: "That conversation wasn't found." };

  const identifiers = [`support-user:${user.id}`];

  if (await isRateLimited(identifiers)) {
    return { error: "You've sent several messages recently. Please wait a few minutes." };
  }

  await recordLoginAttempt(identifiers, false);

  await db.insert(supportMessages).values({
    ticketId: ticket.id,
    kind: "customer",
    body: text,
    authorUserId: user.id,
  });

  await db
    .update(supportTickets)
    .set({ status: "open", updatedAt: new Date(), resolvedAt: null })
    .where(eq(supportTickets.id, ticket.id));

  await logAudit({
    userId: user.id,
    module: "support",
    action: "support.customer_replied",
    recordId: ticket.id,
    newValue: { reference: ticket.reference },
  });

  await sendEmail({
    to: SUPPORT_INBOX,
    replyTo: ticket.email,
    subject: `[${ticket.reference}] New message: ${ticket.subject}`,
    text: `${ticket.name} <${ticket.email}> added a message to ${ticket.reference}:\n\n${text}\n\nOpen it in the admin panel: ${SITE_URL}/admin/support`,
  });

  return { success: true };
}
