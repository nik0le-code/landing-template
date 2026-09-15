import { ActionError, defineAction } from "astro:actions";
import { z } from "astro/zod";
import { eq } from "drizzle-orm";
import { requireUser } from "@/admin/auth/guard";
import { formCheckbox, formText } from "@/lib/form-schema";
import { getDb } from "@/db";
import { leadSubmissions } from "./db/schema";
import { LEAD_FIELDS, LEAD_STATUSES } from "./options";
import { ATTRIBUTION_KEYS, submitLead } from "./lib/submit";

const text = formText(6000);
const attribution = formText(300);

/** `actions.leads.*` */
export const actions = {
  /** Public: used by <LeadForm> when JavaScript is available. */
  submit: defineAction({
    accept: "form",
    input: z.object({
      form: z.string().max(40),
      name: text,
      email: text,
      phone: text,
      company: text,
      subject: text,
      message: text,
      consent: formCheckbox(),
      website: text,
      startedAt: z.coerce.number().optional(),
      locale: formText(10),
      page: formText(300),
      utm_source: attribution,
      utm_medium: attribution,
      utm_campaign: attribution,
      utm_term: attribution,
      utm_content: attribution,
      gclid: attribution,
      gbraid: attribution,
      wbraid: attribution,
      fbclid: attribution,
      landing_page: attribution,
      referrer: attribution,
    }),
    handler: async (input, context) => {
      const result = await submitLead({
        form: input.form,
        values: Object.fromEntries(LEAD_FIELDS.map((field) => [field, input[field]])),
        consent: input.consent,
        honeypot: input.website,
        startedAt: input.startedAt ?? null,
        locale: input.locale,
        pagePath: input.page,
        attribution: Object.fromEntries(ATTRIBUTION_KEYS.map((key) => [key, input[key]])),
        clientAddress: context.clientAddress,
      });
      if (!result.ok) {
        throw new ActionError({
          code: result.code === "rateLimited" ? "TOO_MANY_REQUESTS" : "BAD_REQUEST",
          message: JSON.stringify({ code: result.code, fields: result.fields ?? {} }),
        });
      }
      return { ok: true };
    },
  }),

  update: defineAction({
    accept: "form",
    input: z.object({ id: z.uuid(), status: z.enum(LEAD_STATUSES), notes: formText(5000) }),
    handler: async ({ id, status, notes }, context) => {
      requireUser(context, "editor");
      await getDb().update(leadSubmissions).set({ status, notes }).where(eq(leadSubmissions.id, id));
      return { ok: true };
    },
  }),

  delete: defineAction({
    accept: "form",
    input: z.object({ id: z.uuid() }),
    handler: async ({ id }, context) => {
      requireUser(context, "admin");
      await getDb().delete(leadSubmissions).where(eq(leadSubmissions.id, id));
      return { ok: true };
    },
  }),
};
