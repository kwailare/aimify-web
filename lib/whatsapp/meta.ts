import { createHmac, timingSafeEqual } from "crypto";
import { type WhatsAppProvider, WhatsAppError, type WhatsAppStatusUpdate } from "@/lib/whatsapp/types";

// Meta's WhatsApp Cloud API: messages go from Aimify's WhatsApp Business
// number using pre-approved templates (docs/whatsapp-setup.md).
//
//   WHATSAPP_TOKEN            a permanent system-user access token
//   WHATSAPP_PHONE_NUMBER_ID  the sending number's id
//   WHATSAPP_APP_SECRET       to check webhook signatures
//   WHATSAPP_VERIFY_TOKEN     any secret, also entered in Meta's webhook setup

const GRAPH = "https://graph.facebook.com/v21.0";
const TIMEOUT_MS = 20000;

export const meta: WhatsAppProvider = {
  id: "meta",
  name: "WhatsApp Cloud API",

  isConfigured() {
    return Boolean(process.env.WHATSAPP_TOKEN?.trim() && process.env.WHATSAPP_PHONE_NUMBER_ID?.trim());
  },

  async send(input) {
    if (!this.isConfigured()) throw new WhatsAppError("WhatsApp isn't set up.");
    let response: Response;
    try {
      response = await fetch(`${GRAPH}/${process.env.WHATSAPP_PHONE_NUMBER_ID!.trim()}/messages`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${process.env.WHATSAPP_TOKEN!.trim()}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: input.to,
          type: "template",
          template: {
            name: input.template,
            language: { code: input.language },
            components: [
              { type: "body", parameters: input.params.map((text) => ({ type: "text", text })) },
            ],
          },
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw new WhatsAppError("Couldn't reach WhatsApp.");
    }
    const json = (await response.json().catch(() => null)) as {
      messages?: { id: string }[];
      error?: { message?: string };
    } | null;
    const id = json?.messages?.[0]?.id;
    if (!response.ok || !id) {
      throw new WhatsAppError(json?.error?.message ?? `WhatsApp refused the message (${response.status}).`);
    }
    return { messageId: id, status: "sent" };
  },
};

/** Meta's webhook signature: sha256 of the raw body with the app secret. */
export function isValidMetaSignature(rawBody: string, header: string | null) {
  const secret = process.env.WHATSAPP_APP_SECRET?.trim();
  if (!secret || !header?.startsWith("sha256=")) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(rawBody).digest("hex"), "utf8");
  const received = Buffer.from(header.slice("sha256=".length).trim(), "utf8");
  return expected.length === received.length && timingSafeEqual(expected, received);
}

/** The delivery updates in one of Meta's webhook bodies. */
export function readMetaStatuses(body: unknown): WhatsAppStatusUpdate[] {
  const updates: WhatsAppStatusUpdate[] = [];
  const entries = (body as { entry?: { changes?: { value?: { statuses?: unknown[] } }[] }[] })?.entry ?? [];
  for (const entry of entries) {
    for (const change of entry.changes ?? []) {
      for (const raw of change.value?.statuses ?? []) {
        const s = raw as { id?: string; status?: string; errors?: { title?: string; message?: string }[] };
        if (!s.id || !["sent", "delivered", "read", "failed"].includes(s.status ?? "")) continue;
        updates.push({
          messageId: s.id,
          status: s.status as WhatsAppStatusUpdate["status"],
          error: s.errors?.[0]?.message ?? s.errors?.[0]?.title ?? null,
        });
      }
    }
  }
  return updates;
}
