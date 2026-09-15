/**
 * Transactional email through Resend's HTTP API (no SDK). Sending is optional:
 * without RESEND_API_KEY + EMAIL_FROM, `sendEmail` logs and returns false, so
 * features that notify (leads, bookings) keep working.
 */
import { EMAIL_FROM, RESEND_API_KEY } from "astro:env/server";

export interface EmailMessage {
  to: string[];
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
}

export const isEmailConfigured = () => Boolean(RESEND_API_KEY && EMAIL_FROM);

export async function sendEmail(message: EmailMessage): Promise<boolean> {
  if (!message.to.length) return false;
  if (!isEmailConfigured()) {
    console.info(`[email] not configured; skipped "${message.subject}"`);
    return false;
  }
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
        ...(message.replyTo && { reply_to: message.replyTo }),
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      console.error(`[email] Resend responded ${response.status}: ${await response.text()}`);
      return false;
    }
    return true;
  } catch (error) {
    console.error("[email] send failed", error);
    return false;
  }
}

const HTML_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]!);
