import { siteConfig } from "@site-config";
import { escapeHtml, sendEmail } from "@/lib/email";
import { absoluteUrl } from "@/lib/site";
import { translateModule } from "@/modules/registry";
import type { LeadSubmission } from "../db/schema";
import { LEAD_FIELDS } from "../options";

/** Emails the configured recipients; reply-to is the lead's address. */
export async function notifyNewLead(lead: LeadSubmission, to: string[]) {
  const lang = siteConfig.defaultLocale;
  const t = (key: string, params?: Record<string, string>) => translateModule(lang, "leads", key, params);
  const rows = LEAD_FIELDS.flatMap((field) => (lead[field] ? [[t(`fields.${field}`), lead[field]!] as const] : []));
  const adminUrl = absoluteUrl(`/admin/leads/${lead.id}`);

  const html = `<p>${escapeHtml(t("email.intro"))}</p>
<table cellpadding="6" style="border-collapse:collapse;font-family:sans-serif;font-size:14px">
${rows.map(([label, value]) => `<tr><th align="left" valign="top" style="color:#555">${escapeHtml(label)}</th><td style="white-space:pre-wrap">${escapeHtml(value)}</td></tr>`).join("\n")}
</table>
<p><a href="${escapeHtml(adminUrl)}">${escapeHtml(t("email.open"))}</a></p>`;
  const text = `${t("email.intro")}\n\n${rows.map(([label, value]) => `${label}: ${value}`).join("\n")}\n\n${adminUrl}`;

  await sendEmail({
    to,
    subject: `[${siteConfig.name}] ${t("email.subject", { form: lead.form })}`,
    html,
    text,
    ...(lead.email && { replyTo: lead.email }),
  });
}
