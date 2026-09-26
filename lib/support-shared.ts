export const TICKET_STATUSES = ["open", "pending", "resolved"] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  open: "Open",
  pending: "Waiting on customer",
  resolved: "Resolved",
};

export const LIMITS = {
  name: 100,
  email: 254,
  subject: 150,
  message: 5000,
};

export function isTicketStatus(value: string): value is TicketStatus {
  return (TICKET_STATUSES as readonly string[]).includes(value);
}
