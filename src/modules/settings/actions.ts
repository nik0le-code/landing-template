import { ActionError, defineAction } from "astro:actions";
import { z } from "astro/zod";
import { siteConfig } from "@site-config";
import { requireUser } from "@/admin/auth/guard";
import { formCheckbox, formLink, formText, formUrl } from "@/lib/form-schema";
import type { SiteSettings } from "@/lib/settings";
import { saveSettings } from "./lib/store";

const SOCIALS = ["facebook", "instagram", "linkedin", "x", "youtube", "tiktok"] as const;
const text = formText(300);

const localeFields = Object.fromEntries(siteConfig.locales.flatMap((lang) => [[`text_${lang}`, text], [`linkText_${lang}`, text]]));

/** `actions.settings.save` — admins only. */
export const actions = {
  save: defineAction({
    accept: "form",
    input: z.object({
      enabled: formCheckbox(),
      href: formLink(),
      notifyEmails: formText(2000),
      ...Object.fromEntries(SOCIALS.map((network) => [network, formUrl()])),
      ...localeFields,
    }) as unknown as z.ZodType<Record<string, string> & { enabled: boolean }>,
    handler: async (input, context) => {
      const user = requireUser(context, "admin");

      const emails = input.notifyEmails!.split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean);
      const invalid = emails.find((email) => !z.email().safeParse(email).success);
      if (invalid) throw new ActionError({ code: "BAD_REQUEST", message: `invalidEmail:${invalid}` });

      const settings: SiteSettings = {
        announcement: {
          enabled: input.enabled,
          text: Object.fromEntries(siteConfig.locales.map((lang) => [lang, input[`text_${lang}`] ?? ""])),
          href: input.href ?? "",
          linkText: Object.fromEntries(siteConfig.locales.map((lang) => [lang, input[`linkText_${lang}`] ?? ""])),
        },
        socials: Object.fromEntries(SOCIALS.flatMap((network) => (input[network] ? [[network, input[network]]] : []))),
        notifyEmails: [...new Set(emails)],
      };
      await saveSettings(settings, user.id);
      // Refresh cached pages/islands that render settings.
      await context.cache.invalidate({ tags: ["settings"] });
      return { ok: true };
    },
  }),
};
