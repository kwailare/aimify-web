import {
  AdminSupportManager,
  type AdminTicket,
} from "@/components/admin-support-manager";
import { getAdminTickets, getTicketCounts } from "@/lib/support";

export default async function AdminSupportPage() {
  const [tickets, counts] = await Promise.all([
    getAdminTickets(),
    getTicketCounts(),
  ]);

  const rows: AdminTicket[] = tickets.map((ticket) => ({
    ...ticket,
    createdAt: ticket.createdAt.toISOString(),
    updatedAt: ticket.updatedAt.toISOString(),
    messages: ticket.messages.map((message) => ({
      ...message,
      createdAt: message.createdAt.toISOString(),
    })),
  }));

  return (
    <div className="dash-stack dash-stack--wide">
      <div>
        <p className="dash-page-eyebrow">Support</p>
        <h1 className="dash-page-title">Support inbox</h1>
        <p className="dash-page-subtitle">
          Every message from the contact form and from customers&apos; dashboards,
          tracked in one place. Replies are emailed to the customer; private
          notes stay here. A customer replying by email lands in the info@
          mailbox, so paste anything important in as a note.
        </p>
      </div>

      <AdminSupportManager tickets={rows} counts={counts} />
    </div>
  );
}
