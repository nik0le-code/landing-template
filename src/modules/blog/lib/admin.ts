import type { Locale } from "@site-config";
import { useTranslations } from "@/i18n";
import { formErrors } from "@/admin/lib/forms";
import { translateModule } from "@/modules/registry";
import type { BlogPost } from "../db/schema";

/** Admin form errors, translating blog-specific codes (slugTaken…) as well. */
export function blogFormErrors(lang: Locale, error: unknown) {
  const errors = formErrors(useTranslations(lang), error);
  const translate = (message: string | undefined) => {
    if (!message) return message;
    const translated = translateModule(lang, "blog", `admin.${message}`);
    return translated === `admin.${message}` ? message : translated;
  };
  return {
    form: translate(errors.form),
    fields: Object.fromEntries(Object.entries(errors.fields).map(([field, message]) => [field, translate(message)!])),
  };
}

export type PostState = "draft" | "published" | "scheduled";

export function postState(post: Pick<BlogPost, "status" | "publishedAt">): PostState {
  if (post.status === "draft") return "draft";
  return post.publishedAt && post.publishedAt > new Date() ? "scheduled" : "published";
}

/** Formats a Date for <input type="datetime-local"> in the server's timezone. */
export function toDateTimeLocal(date: Date | null) {
  if (!date) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
