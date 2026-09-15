/**
 * Lead submission service, shared by the Astro Action (JavaScript path) and the
 * form-post page (no-JavaScript path) so both behave identically.
 */
import { z } from "astro/zod";
import { siteConfig } from "@site-config";
import { getDb } from "@/db";
import { consume } from "@/lib/rate-limit";
import { getModuleOptions } from "@/modules/registry";
import { leadSubmissions } from "../db/schema";
import { leadsDefaults, type LeadField } from "../options";
import { notifyNewLead } from "./notify";

export const leadsOptions = () => getModuleOptions("leads", leadsDefaults);

/** Attribution keys accepted from the client (first-touch, captured from the landing URL). */
export const ATTRIBUTION_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "gclid",
  "gbraid",
  "wbraid",
  "fbclid",
  "landing_page",
  "referrer",
] as const;

/** Faster than this from page load to submit is almost certainly a bot. */
const MIN_FILL_MS = 2500;
const MAX_LINKS = 3;

export type FieldError = "required" | "invalidEmail" | "invalidPhone" | "tooLong" | "consentRequired";

export type SubmitResult =
  | { ok: true }
  | { ok: false; code: "unknownForm" | "rateLimited" | "invalid"; fields?: Partial<Record<LeadField | "consent", FieldError>> };

export interface SubmitInput {
  form: string;
  values: Partial<Record<LeadField, string>>;
  consent: boolean;
  /** Hidden field humans never fill. */
  honeypot: string;
  /** `Date.now()` recorded by the page script when the form became visible; null without JS. */
  startedAt: number | null;
  locale: string;
  pagePath: string;
  attribution: Record<string, string>;
  clientAddress: string;
}

const MAX_LENGTH: Record<LeadField, number> = { name: 120, email: 254, phone: 40, company: 160, subject: 200, message: 5000 };

function validateField(field: LeadField, value: string, required: boolean): FieldError | null {
  if (!value) return required ? "required" : null;
  if (value.length > MAX_LENGTH[field]) return "tooLong";
  if (field === "email" && !z.email().safeParse(value).success) return "invalidEmail";
  if (field === "phone" && !/^[+()\d\s.-]{6,40}$/.test(value)) return "invalidPhone";
  return null;
}

export async function submitLead(input: SubmitInput): Promise<SubmitResult> {
  const options = leadsOptions();
  const formConfig = options.forms[input.form];
  if (!formConfig) return { ok: false, code: "unknownForm" };

  // Bots filling the honeypot get a fake success and nothing is stored.
  if (input.honeypot.trim()) return { ok: true };

  const limit = consume(`leads:${input.clientAddress}`, options.rateLimit.max, options.rateLimit.windowMinutes * 60_000);
  if (!limit.allowed) return { ok: false, code: "rateLimited" };

  const values: Partial<Record<LeadField, string>> = {};
  const fields: NonNullable<Extract<SubmitResult, { ok: false }>["fields"]> = {};
  for (const field of formConfig.fields) {
    const value = (input.values[field] ?? "").trim();
    const error = validateField(field, value, formConfig.required.includes(field));
    if (error) fields[field] = error;
    else if (value) values[field] = field === "email" ? value.toLowerCase() : value;
  }
  if (formConfig.consent && !input.consent) fields.consent = "consentRequired";
  if (Object.keys(fields).length) return { ok: false, code: "invalid", fields };

  const links = (values.message?.match(/https?:\/\//gi) ?? []).length;
  const spamReason =
    input.startedAt !== null && Date.now() - input.startedAt < MIN_FILL_MS ? "tooFast" : links > MAX_LINKS ? "tooManyLinks" : null;

  const attribution = Object.fromEntries(
    ATTRIBUTION_KEYS.flatMap((key) => (input.attribution[key] ? [[key, input.attribution[key]!.slice(0, 300)]] : [])),
  );
  const locale = (siteConfig.locales as readonly string[]).includes(input.locale) ? input.locale : siteConfig.defaultLocale;

  const [lead] = await getDb()
    .insert(leadSubmissions)
    .values({
      form: input.form,
      ...values,
      status: spamReason ? "spam" : "new",
      spamReason,
      locale,
      pagePath: input.pagePath.slice(0, 300) || null,
      attribution: Object.keys(attribution).length ? attribution : null,
    })
    .returning();

  // Don't make the visitor wait for the email provider; failures are logged.
  if (!spamReason && options.notifyEmails.length) void notifyNewLead(lead!, options.notifyEmails);
  return { ok: true };
}
