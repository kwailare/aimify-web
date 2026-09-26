import { redirect } from "next/navigation";
import {
  SupportCenter,
  type CustomerTicket,
} from "@/components/support-center";
import { getOrgContext } from "@/lib/org";
import { getUserTickets } from "@/lib/support";

export default async function DashboardSupportPage() {
  const context = await getOrgContext();

  if (!context) {
    redirect("/signin");
  }

  const tickets = await getUserTickets(context.user.id, context.user.email);

  const rows: CustomerTicket[] = tickets.map((ticket) => ({
    id: ticket.id,
    reference: ticket.reference,
    subject: ticket.subject,
    status: ticket.status,
    updatedAt: ticket.updatedAt.toISOString(),
    messages: ticket.messages.map((message) => ({
      id: message.id,
      kind: message.kind,
      body: message.body,
      createdAt: message.createdAt.toISOString(),
    })),
  }));

  return (
    <div className="dash-stack dash-stack--wide">
      <div>
        <p className="dash-page-eyebrow">Support</p>
        <h1 className="dash-page-title">Contact support</h1>
        <p className="dash-page-subtitle">
          Ask a question or report a problem. We reply by email within one
          business day, and the conversation is kept here so you can follow it.
        </p>
      </div>

      <SupportCenter tickets={rows} />
    </div>
  );
}
