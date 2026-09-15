/**
 * `modules.config.ts` → `options: { leads: { … } }`
 *
 * ```ts
 * leads: {
 *   notifyEmails: ["sales@client.gr"],
 *   forms: {
 *     contact: { fields: ["name", "email", "phone", "message"], required: ["name", "email", "message"], consent: true },
 *     waitlist: { fields: ["email"], required: ["email"] },
 *   },
 * }
 * ```
 */
export const LEAD_FIELDS = ["name", "email", "phone", "company", "subject", "message"] as const;
export type LeadField = (typeof LEAD_FIELDS)[number];

export interface LeadFormConfig {
  /** Fields shown, in this order. */
  fields: LeadField[];
  /** Subset of `fields` that must be filled. */
  required: LeadField[];
  /** Require ticking "I accept the privacy policy". */
  consent?: boolean;
}

export const LEAD_STATUSES = ["new", "contacted", "qualified", "won", "lost", "spam"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export interface LeadsOptions {
  /** Who gets an email per submission. Empty = no emails (the inbox still works). */
  notifyEmails: string[];
  forms: Record<string, LeadFormConfig>;
  /** Name in siteConfig.tracking.conversions fired on success; "" disables. */
  conversion: string;
  /** Submissions allowed per visitor IP per window. */
  rateLimit: { max: number; windowMinutes: number };
}

export const leadsDefaults: LeadsOptions = {
  notifyEmails: [],
  forms: {
    contact: { fields: ["name", "email", "phone", "message"], required: ["name", "email", "message"], consent: true },
    waitlist: { fields: ["email"], required: ["email"] },
  },
  conversion: "lead",
  rateLimit: { max: 5, windowMinutes: 10 },
};

declare module "@/modules/types" {
  interface ModuleOptionsMap {
    leads: LeadsOptions;
  }
}
