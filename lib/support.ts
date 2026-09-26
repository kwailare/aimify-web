import { randomBytes } from "crypto";
import { and, count, desc, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { organizations, supportMessages, supportTickets, users } from "@/db/schema";
import { sendEmail } from "@/lib/email";
import { SITE_URL } from "@/lib/site";
import { LIMITS } from "@/lib/support-shared";

export {
  LIMITS,
  TICKET_STATUSES,
  TICKET_STATUS_LABELS,
  isTicketStatus,
  type TicketStatus,
} from "@/lib/support-shared";

export const SUPPORT_INBOX = "info@aimify.app";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REFERENCE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function newReference() {
  const bytes = randomBytes(6);
  let code = "";

  for (let i = 0; i < 6; i++) {
    code += REFERENCE_ALPHABET[bytes[i] % REFERENCE_ALPHABET.length];
  }

  return `AIM-${code}`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function paragraphs(value: string) {
  return value
    .split(/\n{2,}/)
    .map((part) => `<p>${escapeHtml(part).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

export function validateTicketInput(input: {
  name: string;
  email: string;
  subject: string;
  message: string;
}) {
  if (!input.name || !input.email || !input.subject || !input.message) {
    return "All fields are required.";
  }

  if (!EMAIL_PATTERN.test(input.email) || input.email.length > LIMITS.email) {
    return "Enter a valid email address.";
  }

  if (input.name.length > LIMITS.name) {
    return `Name must be at most ${LIMITS.name} characters.`;
  }

  if (input.subject.length > LIMITS.subject) {
    return `Subject must be at most ${LIMITS.subject} characters.`;
  }

  if (input.message.length > LIMITS.message) {
    return `Message must be at most ${LIMITS.message.toLocaleString("en-US")} characters.`;
  }

  return null;
}

export async function createTicket(input: {
  name: string;
  email: string;
  subject: string;
  message: string;
  source: "contact_form" | "dashboard";
  userId?: string | null;
  organizationId?: string | null;
}) {
  let ticket: typeof supportTickets.$inferSelect | undefined;

  for (let attempt = 0; attempt < 5 && !ticket; attempt++) {
    const [created] = await db
      .insert(supportTickets)
      .values({
        reference: newReference(),
        name: input.name,
        email: input.email.toLowerCase(),
        subject: input.subject,
        source: input.source,
        userId: input.userId ?? null,
        organizationId: input.organizationId ?? null,
      })
      .onConflictDoNothing()
      .returning();

    ticket = created;
  }

  if (!ticket) {
    throw new Error("Could not allocate a ticket reference.");
  }

  await db.insert(supportMessages).values({
    ticketId: ticket.id,
    kind: "customer",
    body: input.message,
    authorUserId: input.userId ?? null,
  });

  const adminLink = `${SITE_URL}/admin/support`;

  await Promise.all([
    sendEmail({
      to: SUPPORT_INBOX,
      replyTo: input.email,
      subject: `[${ticket.reference}] ${input.subject}`,
      text: `New support message ${ticket.reference} from ${input.name} <${input.email}>:\n\n${input.message}\n\nOpen it in the admin panel: ${adminLink}`,
      html: `<p><strong>${escapeHtml(ticket.reference)}</strong> from ${escapeHtml(input.name)} &lt;${escapeHtml(input.email)}&gt;</p>${paragraphs(input.message)}<p><a href="${adminLink}">Open it in the admin panel</a></p>`,
    }),
    sendEmail({
      to: input.email,
      subject: `We got your message [${ticket.reference}]`,
      text: `Hi ${input.name},\n\nThanks for contacting Aimify. Your reference is ${ticket.reference}. We'll reply within one business day.\n\nYou can reply to this email to add more details.`,
      html: `<p>Hi ${escapeHtml(input.name)},</p><p>Thanks for contacting Aimify. Your reference is <strong>${escapeHtml(ticket.reference)}</strong>. We&apos;ll reply within one business day.</p><p>You can reply to this email to add more details.</p>`,
    }),
  ]);

  return ticket;
}

export async function sendReplyEmail(
  ticket: { reference: string; name: string; email: string; subject: string },
  body: string,
) {
  return sendEmail({
    to: ticket.email,
    subject: `Re: [${ticket.reference}] ${ticket.subject}`,
    text: `Hi ${ticket.name},\n\n${body}\n\n— Aimify Support\nReference: ${ticket.reference}. Reply to this email to continue the conversation.`,
    html: `<p>Hi ${escapeHtml(ticket.name)},</p>${paragraphs(body)}<p>— Aimify Support<br><span style="color:#666;font-size:12px">Reference: ${escapeHtml(ticket.reference)}. Reply to this email to continue the conversation.</span></p>`,
  });
}

export async function getTicketCounts() {
  const rows = await db
    .select({ status: supportTickets.status, value: count() })
    .from(supportTickets)
    .groupBy(supportTickets.status);

  const counts: Record<string, number> = { open: 0, pending: 0, resolved: 0 };

  for (const row of rows) counts[row.status] = row.value;

  return counts;
}

export async function getAdminTickets(limit = 200) {
  const tickets = await db
    .select({
      id: supportTickets.id,
      reference: supportTickets.reference,
      name: supportTickets.name,
      email: supportTickets.email,
      subject: supportTickets.subject,
      status: supportTickets.status,
      source: supportTickets.source,
      createdAt: supportTickets.createdAt,
      updatedAt: supportTickets.updatedAt,
      organizationName: organizations.name,
    })
    .from(supportTickets)
    .leftJoin(organizations, eq(supportTickets.organizationId, organizations.id))
    .orderBy(
      sql`case ${supportTickets.status} when 'open' then 0 when 'pending' then 1 else 2 end`,
      desc(supportTickets.updatedAt),
    )
    .limit(limit);

  if (tickets.length === 0) return [];

  const messages = await db
    .select({
      id: supportMessages.id,
      ticketId: supportMessages.ticketId,
      kind: supportMessages.kind,
      body: supportMessages.body,
      emailed: supportMessages.emailed,
      createdAt: supportMessages.createdAt,
      authorName: users.name,
    })
    .from(supportMessages)
    .leftJoin(users, eq(supportMessages.authorUserId, users.id))
    .where(
      inArray(
        supportMessages.ticketId,
        tickets.map((ticket) => ticket.id),
      ),
    )
    .orderBy(supportMessages.createdAt);

  const byTicket = new Map<string, (typeof messages)[number][]>();

  for (const message of messages) {
    const list = byTicket.get(message.ticketId) ?? [];
    list.push(message);
    byTicket.set(message.ticketId, list);
  }

  return tickets.map((ticket) => ({
    ...ticket,
    messages: byTicket.get(ticket.id) ?? [],
  }));
}

export async function getUserTickets(userId: string, email: string) {
  const tickets = await db
    .select()
    .from(supportTickets)
    .where(
      or(eq(supportTickets.userId, userId), and(eq(supportTickets.email, email.toLowerCase()), eq(supportTickets.source, "contact_form"))),
    )
    .orderBy(desc(supportTickets.updatedAt))
    .limit(50);

  if (tickets.length === 0) return [];

  const messages = await db
    .select()
    .from(supportMessages)
    .where(
      and(
        inArray(
          supportMessages.ticketId,
          tickets.map((ticket) => ticket.id),
        ),
        inArray(supportMessages.kind, ["customer", "reply"]),
      ),
    )
    .orderBy(supportMessages.createdAt);

  const byTicket = new Map<string, (typeof messages)[number][]>();

  for (const message of messages) {
    const list = byTicket.get(message.ticketId) ?? [];
    list.push(message);
    byTicket.set(message.ticketId, list);
  }

  return tickets.map((ticket) => ({
    ...ticket,
    messages: byTicket.get(ticket.id) ?? [],
  }));
}
