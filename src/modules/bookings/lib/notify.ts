/** Booking emails: a notification to the team, confirmations/cancellations to the customer. */
import { siteConfig, type Locale } from "@site-config";
import { escapeHtml, sendEmail } from "@/lib/email";
import { getSiteSettings } from "@/lib/settings";
import { absoluteUrl } from "@/lib/site";
import { pickLocalized } from "@/i18n";
import { translateModule } from "@/modules/registry";
import type { Booking } from "../db/schema";
import { bookingsOptions } from "./availability";

const t = (lang: string, key: string, params?: Record<string, string>) => translateModule(lang as Locale, "bookings", key, params);

function serviceLabel(booking: Booking) {
  const service = bookingsOptions().services.find((entry) => entry.value === booking.service);
  return service ? pickLocalized(service.label, booking.locale as Locale) : "";
}

function summary(booking: Booking, lang: string) {
  return [
    [t(lang, "fields.date"), `${booking.date} ${booking.time}`],
    [t(lang, "fields.service"), serviceLabel(booking)],
    [t(lang, "fields.name"), booking.name],
    [t(lang, "fields.email"), booking.email],
    [t(lang, "fields.phone"), booking.phone],
    [t(lang, "fields.people"), booking.people ? String(booking.people) : ""],
    [t(lang, "fields.notes"), booking.notes],
  ].filter(([, value]) => value) as [string, string][];
}

const table = (rows: [string, string][]) =>
  `<table cellpadding="6" style="border-collapse:collapse;font-family:sans-serif;font-size:14px">${rows
    .map(([label, value]) => `<tr><th align="left" valign="top" style="color:#555">${escapeHtml(label)}</th><td style="white-space:pre-wrap">${escapeHtml(value)}</td></tr>`)
    .join("")}</table>`;

/** To the team, when a request arrives. */
export async function notifyNewBooking(booking: Booking) {
  const lang = siteConfig.defaultLocale;
  const recipients = [...new Set([...bookingsOptions().notifyEmails, ...(await getSiteSettings()).notifyEmails])];
  if (!recipients.length) return;
  const rows = summary(booking, lang);
  const link = absoluteUrl(`/admin/bookings/${booking.id}`);
  await sendEmail({
    to: recipients,
    subject: `[${siteConfig.name}] ${t(lang, "email.newSubject", { date: booking.date, time: booking.time })}`,
    html: `<p>${escapeHtml(t(lang, "email.newIntro"))}</p>${table(rows)}<p><a href="${escapeHtml(link)}">${escapeHtml(t(lang, "email.open"))}</a></p>`,
    text: `${t(lang, "email.newIntro")}\n\n${rows.map(([l, v]) => `${l}: ${v}`).join("\n")}\n\n${link}`,
    replyTo: booking.email,
  });
}

/** To the customer, in their own language, when a booking is confirmed or cancelled. */
export async function notifyCustomer(booking: Booking, kind: "confirmed" | "cancelled") {
  if (!bookingsOptions().emailCustomer) return;
  const lang = booking.locale;
  const rows = summary(booking, lang);
  const intro = t(lang, `email.${kind}Intro`, { name: booking.name });
  await sendEmail({
    to: [booking.email],
    subject: `[${siteConfig.name}] ${t(lang, `email.${kind}Subject`, { date: booking.date, time: booking.time })}`,
    html: `<p>${escapeHtml(intro)}</p>${table(rows)}<p>${escapeHtml(siteConfig.name)} · ${escapeHtml(siteConfig.contact.email)}</p>`,
    text: `${intro}\n\n${rows.map(([l, v]) => `${l}: ${v}`).join("\n")}\n\n${siteConfig.name} · ${siteConfig.contact.email}`,
  });
}
