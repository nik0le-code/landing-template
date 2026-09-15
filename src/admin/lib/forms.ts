/**
 * Turns an action result into translated form errors.
 *
 * Action handlers throw `ActionError({ message: "<key>[:<param>]" })` with keys from
 * `admin.errors.*`; Zod messages that match a key (e.g. "passwordTooShort") are
 * translated too, anything else falls back to Zod's own text.
 */
import { isActionError, isInputError } from "astro:actions";
import { MIN_PASSWORD_LENGTH } from "@/admin/auth/password";
import type { useTranslations } from "@/i18n";

type T = ReturnType<typeof useTranslations>;

export interface FormErrors {
  form?: string;
  fields: Record<string, string>;
}

function translateMessage(t: T, message: string): string {
  const [key, param] = message.split(":");
  const translationKey = `admin.errors.${key}` as Parameters<T>[0];
  const translated = t(translationKey, { minutes: param ?? "", min: MIN_PASSWORD_LENGTH });
  return translated === translationKey ? message : translated;
}

export function formErrors(t: T, error: unknown): FormErrors {
  if (!error) return { fields: {} };
  if (isInputError(error)) {
    const fields = Object.fromEntries(
      Object.entries(error.fields).flatMap(([field, messages]) =>
        messages?.[0] ? [[field, translateMessage(t, messages[0])]] : [],
      ),
    );
    return { fields };
  }
  if (isActionError(error)) {
    const message = error.message && error.message !== error.code ? translateMessage(t, error.message) : t("admin.errors.generic");
    return { form: message, fields: {} };
  }
  return { form: t("admin.errors.generic"), fields: {} };
}

/** Only allow same-site relative redirects (`?next=` after login). */
export function safeNext(value: string | null, fallback = "/admin"): string {
  return value && value.startsWith("/admin") && !value.startsWith("//") ? value : fallback;
}
