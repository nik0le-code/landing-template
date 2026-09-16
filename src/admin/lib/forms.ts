/**
 * Turns an action result into translated form errors.
 *
 * Action handlers throw `ActionError({ message: "<key>[:<param>]" })` with keys from
 * `admin.errors.*`; Zod messages that match a key (e.g. "passwordTooShort") are
 * translated too, anything else falls back to Zod's own text.
 */
import { isActionError, isInputError } from "astro:actions";
import { MIN_PASSWORD_LENGTH } from "@/admin/auth/password";
import { useTranslations, type Locale } from "@/i18n";
import { translateModule } from "@/modules/registry";

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

/**
 * Like formErrors, but also translates a module's own error codes, looked up as
 * `admin.<code>` in that module's i18n (e.g. blog "slugTaken").
 */
export function moduleFormErrors(lang: Locale, moduleName: string, error: unknown): FormErrors {
  const errors = formErrors(useTranslations(lang), error);
  const translate = (message: string) => {
    const key = `admin.${message}`;
    const translated = translateModule(lang, moduleName, key);
    return translated === key ? message : translated;
  };
  return {
    form: errors.form && translate(errors.form),
    fields: Object.fromEntries(Object.entries(errors.fields).map(([field, message]) => [field, translate(message)])),
  };
}
