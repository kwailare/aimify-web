import { Resend } from "resend";

const FROM_ADDRESS = "Aimify <no-reply@aimify.app>";
const REPLY_TO = "support@aimify.app";

export async function sendEmail(message: {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    console.error("sendEmail skipped: RESEND_API_KEY is not set.");
    return false;
  }

  try {
    const { error } = await new Resend(apiKey).emails.send({
      from: FROM_ADDRESS,
      replyTo: REPLY_TO,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });

    if (error) {
      console.error("sendEmail failed:", error.name, error.message);
      return false;
    }

    return true;
  } catch (error) {
    console.error("sendEmail threw:", error);
    return false;
  }
}
