"use server";

import { headers } from "next/headers";
import { createTicket, validateTicketInput } from "@/lib/support";
import { getClientIp, isRateLimited, recordLoginAttempt } from "@/lib/rate-limit";

const GENERIC_ERROR =
  "Message could not be sent. Please try again, or email us directly at info@aimify.app.";

export async function sendContactMessageAction(formData: FormData) {
  if (String(formData.get("website") ?? "").trim()) {
    return { success: true };
  }

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const subject = String(formData.get("subject") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();

  const invalid = validateTicketInput({ name, email, subject, message });

  if (invalid) {
    return { error: invalid };
  }

  const ip = getClientIp(await headers());
  const identifiers = [`contact-ip:${ip}`, `contact-email:${email.toLowerCase()}`];

  if (await isRateLimited(identifiers)) {
    return {
      error: "You've sent several messages recently. Please wait a few minutes and try again.",
    };
  }

  await recordLoginAttempt(identifiers, false);

  try {
    await createTicket({ name, email, subject, message, source: "contact_form" });
  } catch {
    return { error: GENERIC_ERROR };
  }

  return { success: true };
}
