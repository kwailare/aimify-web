"use server";

import { Resend } from "resend";

const CONTACT_INBOX = "info@aimify.app";
const FROM_ADDRESS = "Aimify Contact Form <contact@aimify.app>";
const GENERIC_ERROR =
  "Message could not be sent. Please try again, or email us directly at info@aimify.app.";

export async function sendContactMessageAction(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const subject = String(formData.get("subject") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();

  if (!name || !email || !subject || !message) {
    return { error: "All fields are required." };
  }

  if (!process.env.RESEND_API_KEY) {
    return { error: GENERIC_ERROR };
  }

  const resend = new Resend(process.env.RESEND_API_KEY);

  const { error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to: CONTACT_INBOX,
    replyTo: email,
    subject: `[Contact form] ${subject}`,
    text: `From: ${name} <${email}>\n\n${message}`,
  });

  if (error) {
    return { error: GENERIC_ERROR };
  }

  return { success: true };
}
