import { randomUUID } from "crypto";
import { meta } from "@/lib/whatsapp/meta";
import type { WhatsAppProvider } from "@/lib/whatsapp/types";

export * from "@/lib/whatsapp/types";

// "Record only": logs what would be sent, sends nothing. For trying the
// messages before the WhatsApp Business account exists; never on the live
// site (WHATSAPP_PROVIDER=record is ignored in production).
const record: WhatsAppProvider = {
  id: "record",
  name: "Test mode (recorded, not sent)",
  isConfigured: () => true,
  async send() {
    return { messageId: `recorded-${randomUUID()}`, status: "recorded" };
  },
};

function isProduction() {
  return process.env.VERCEL_ENV === "production" || (process.env.NODE_ENV === "production" && !process.env.VERCEL_ENV);
}

/** The WhatsApp sender in use, or null when WhatsApp isn't set up. */
export function whatsappProvider(): WhatsAppProvider | null {
  if (process.env.WHATSAPP_PROVIDER === "record" && !isProduction()) return record;
  return meta.isConfigured() ? meta : null;
}

export const TEMPLATE_LANGUAGE = () => process.env.WHATSAPP_TEMPLATE_LANGUAGE?.trim() || "en";
