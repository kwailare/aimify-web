// What Aimify needs from a WhatsApp sender, so the message logic never
// talks to a particular company directly (like lib/payments for payments).

export type WhatsAppSendInput = {
  // Digits only, with the country code (2348031234567).
  to: string;
  // The approved template's name and its body parameters, in order.
  template: string;
  params: string[];
  language: string;
};

export type WhatsAppSendResult = {
  messageId: string;
  // "sent" when handed to WhatsApp; "recorded" in test mode (not sent).
  status: "sent" | "recorded";
};

export type WhatsAppStatusUpdate = {
  messageId: string;
  status: "sent" | "delivered" | "read" | "failed";
  error: string | null;
};

export interface WhatsAppProvider {
  id: "meta" | "record";
  name: string;
  isConfigured(): boolean;
  send(input: WhatsAppSendInput): Promise<WhatsAppSendResult>;
}

export class WhatsAppError extends Error {}
