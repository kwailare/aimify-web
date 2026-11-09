// A business's automatic WhatsApp messages, as kept in
// organizations.whatsappSettings. All off until the Owner turns them on.

export type WhatsAppSettings = {
  // To customers who agreed: the invoice after a sale, a receipt after a
  // payment, and reminders of overdue amounts every few days.
  invoices: boolean;
  receipts: boolean;
  reminders: boolean;
  reminderEveryDays: number;
  // To suppliers who agreed: a purchase order when one is placed.
  purchaseOrders: boolean;
  // To team members who asked for them: low and out of stock alerts.
  stockAlerts: boolean;
};

export const DEFAULT_WHATSAPP_SETTINGS: WhatsAppSettings = {
  invoices: false,
  receipts: false,
  reminders: false,
  reminderEveryDays: 7,
  purchaseOrders: false,
  stockAlerts: false,
};

export const REMINDER_DAY_CHOICES = [3, 7, 14, 30] as const;

export function readWhatsAppSettings(value: unknown): WhatsAppSettings {
  const v = (value && typeof value === "object" ? value : {}) as Partial<Record<keyof WhatsAppSettings, unknown>>;
  const flag = (key: keyof WhatsAppSettings) => v[key] === true;
  const every = Number(v.reminderEveryDays);
  return {
    invoices: flag("invoices"),
    receipts: flag("receipts"),
    reminders: flag("reminders"),
    reminderEveryDays: (REMINDER_DAY_CHOICES as readonly number[]).includes(every) ? every : 7,
    purchaseOrders: flag("purchaseOrders"),
    stockAlerts: flag("stockAlerts"),
  };
}
