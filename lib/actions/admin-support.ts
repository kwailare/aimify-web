"use server";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { supportMessages, supportTickets } from "@/db/schema";
import { getAdminContext } from "@/lib/admin";
import { logAudit } from "@/lib/audit";
import { LIMITS, isTicketStatus, sendReplyEmail } from "@/lib/support";

async function loadTicket(ticketId: string) {
  const [ticket] = await db
    .select()
    .from(supportTickets)
    .where(eq(supportTickets.id, ticketId))
    .limit(1);

  return ticket ?? null;
}

function cleanBody(value: string) {
  const body = String(value ?? "").trim();

  if (!body) return { error: "Write a message first." };

  if (body.length > LIMITS.message) {
    return {
      error: `Message must be at most ${LIMITS.message.toLocaleString("en-US")} characters.`,
    };
  }

  return { body };
}

export async function replyToTicketAction(
  ticketId: string,
  rawBody: string,
  resolve: boolean,
) {
  const context = await getAdminContext();

  if (!context) return { error: "Not authorized." };

  const cleaned = cleanBody(rawBody);

  if ("error" in cleaned) return { error: cleaned.error };

  const ticket = await loadTicket(ticketId);

  if (!ticket) return { error: "Ticket not found." };

  const sent = await sendReplyEmail(ticket, cleaned.body);

  await db.insert(supportMessages).values({
    ticketId,
    kind: "reply",
    body: cleaned.body,
    authorUserId: context.admin.id,
    emailed: sent,
  });

  const nextStatus = resolve ? "resolved" : "pending";

  await db
    .update(supportTickets)
    .set({
      status: nextStatus,
      updatedAt: new Date(),
      resolvedAt: resolve ? new Date() : null,
    })
    .where(eq(supportTickets.id, ticketId));

  await logAudit({
    userId: context.admin.id,
    module: "support",
    action: "admin.ticket_replied",
    recordId: ticketId,
    newValue: { reference: ticket.reference, status: nextStatus, emailed: sent },
  });

  return sent
    ? { success: true }
    : {
        error:
          "The reply was saved but the email couldn't be sent. Try emailing the customer directly.",
      };
}

export async function addTicketNoteAction(ticketId: string, rawBody: string) {
  const context = await getAdminContext();

  if (!context) return { error: "Not authorized." };

  const cleaned = cleanBody(rawBody);

  if ("error" in cleaned) return { error: cleaned.error };

  const ticket = await loadTicket(ticketId);

  if (!ticket) return { error: "Ticket not found." };

  await db.insert(supportMessages).values({
    ticketId,
    kind: "note",
    body: cleaned.body,
    authorUserId: context.admin.id,
  });

  await db
    .update(supportTickets)
    .set({ updatedAt: new Date() })
    .where(eq(supportTickets.id, ticketId));

  return { success: true };
}

export async function setTicketStatusAction(ticketId: string, status: string) {
  const context = await getAdminContext();

  if (!context) return { error: "Not authorized." };

  if (!isTicketStatus(status)) return { error: "Choose a valid status." };

  const ticket = await loadTicket(ticketId);

  if (!ticket) return { error: "Ticket not found." };

  await db
    .update(supportTickets)
    .set({
      status,
      updatedAt: new Date(),
      resolvedAt: status === "resolved" ? new Date() : null,
    })
    .where(eq(supportTickets.id, ticketId));

  await logAudit({
    userId: context.admin.id,
    module: "support",
    action: "admin.ticket_status_changed",
    recordId: ticketId,
    previousValue: { status: ticket.status },
    newValue: { reference: ticket.reference, status },
  });

  return { success: true };
}
