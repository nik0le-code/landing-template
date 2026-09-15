import { ActionError, defineAction } from "astro:actions";
import { z } from "astro/zod";
import { eq } from "drizzle-orm";
import { siteConfig } from "@site-config";
import { requireUser } from "@/admin/auth/guard";
import { getDb } from "@/db";
import { formRequiredText, formText } from "@/lib/form-schema";
import { blogCategories, blogPosts } from "./db/schema";
import { renderMarkdown } from "./lib/markdown";
import { slugTaken, translationTaken } from "./lib/posts";
import { isValidSlug, slugify } from "./lib/slug";

const locales = siteConfig.locales as unknown as [string, ...string[]];
const fail = (message: string) => {
  throw new ActionError({ code: "BAD_REQUEST", message });
};

/** Pages, the sitemap and home-page islands all show blog content. */
const invalidate = (context: { cache: { invalidate(o: { tags: string[] }): Promise<void> } }) =>
  context.cache.invalidate({ tags: ["blog", "sitemap"] });

/** `actions.blog.*` — admin only. */
export const actions = {
  savePost: defineAction({
    accept: "form",
    input: z.object({
      id: formText(36),
      translationKey: formText(36),
      locale: z.enum(locales),
      title: formRequiredText(200),
      slug: formText(80),
      excerpt: formText(400),
      content: formText(200_000),
      coverId: formText(36),
      categoryId: formText(36),
      authorName: formText(120),
      status: z.enum(["draft", "published"]),
      /** `datetime-local` value, interpreted in the server's timezone. */
      publishedAt: formText(20),
      seoTitle: formText(200),
      seoDescription: formText(300),
    }),
    handler: async (input, context) => {
      const user = requireUser(context, "editor");
      const slug = input.slug ? input.slug.toLowerCase() : slugify(input.title);
      if (!isValidSlug(slug)) fail("invalidSlug");
      if (await slugTaken(input.locale, slug, input.id || undefined)) fail("slugTaken");
      const translationKey = input.translationKey || crypto.randomUUID();
      if (await translationTaken(translationKey, input.locale, input.id || undefined)) fail("translationTaken");

      const existing = input.id ? (await getDb().select().from(blogPosts).where(eq(blogPosts.id, input.id)).limit(1))[0] : undefined;
      if (input.id && !existing) throw new ActionError({ code: "NOT_FOUND" });

      const parsedDate = input.publishedAt ? new Date(input.publishedAt) : null;
      const publishedAt =
        input.status === "published"
          ? parsedDate && !Number.isNaN(parsedDate.getTime())
            ? parsedDate
            : (existing?.publishedAt ?? new Date())
          : parsedDate && !Number.isNaN(parsedDate.getTime())
            ? parsedDate
            : null;

      const rendered = await renderMarkdown(input.content);
      const values = {
        translationKey,
        locale: input.locale,
        slug,
        title: input.title,
        excerpt: input.excerpt,
        content: input.content,
        contentHtml: rendered.html,
        headings: rendered.headings,
        readingMinutes: rendered.readingMinutes,
        coverId: input.coverId || null,
        categoryId: input.categoryId || null,
        authorName: input.authorName || user.name,
        status: input.status,
        publishedAt,
        seoTitle: input.seoTitle,
        seoDescription: input.seoDescription,
        updatedAt: new Date(),
      };

      const id = existing
        ? (await getDb().update(blogPosts).set(values).where(eq(blogPosts.id, existing.id)).returning({ id: blogPosts.id }))[0]!.id
        : (await getDb().insert(blogPosts).values(values).returning({ id: blogPosts.id }))[0]!.id;
      await invalidate(context);
      return { id };
    },
  }),

  deletePost: defineAction({
    accept: "form",
    input: z.object({ id: z.uuid() }),
    handler: async ({ id }, context) => {
      requireUser(context, "editor");
      await getDb().delete(blogPosts).where(eq(blogPosts.id, id));
      await invalidate(context);
      return { ok: true };
    },
  }),

  saveCategory: defineAction({
    accept: "form",
    input: z.object({
      id: formText(36),
      slug: formText(80),
      sortOrder: formText(6),
      ...Object.fromEntries(siteConfig.locales.map((lang) => [`name_${lang}`, formText(80)])),
    }),
    handler: async (input, context) => {
      requireUser(context, "editor");
      const values = input as Record<string, string>;
      const name = Object.fromEntries(siteConfig.locales.map((lang) => [lang, values[`name_${lang}`] ?? ""]));
      if (!name[siteConfig.defaultLocale]) throw new ActionError({ code: "BAD_REQUEST", message: "required" });
      const slug = values.slug ? values.slug.toLowerCase() : slugify(name[siteConfig.defaultLocale]!);
      if (!isValidSlug(slug)) fail("invalidSlug");
      const row = { slug, name, sortOrder: Number(values.sortOrder) || 0 };
      try {
        if (values.id) await getDb().update(blogCategories).set(row).where(eq(blogCategories.id, values.id));
        else await getDb().insert(blogCategories).values(row);
      } catch {
        fail("slugTaken");
      }
      await invalidate(context);
      return { ok: true };
    },
  }),

  deleteCategory: defineAction({
    accept: "form",
    input: z.object({ id: z.uuid() }),
    handler: async ({ id }, context) => {
      requireUser(context, "editor");
      await getDb().delete(blogCategories).where(eq(blogCategories.id, id));
      await invalidate(context);
      return { ok: true };
    },
  }),
};
