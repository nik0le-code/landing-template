import { ActionError, defineAction } from "astro:actions";
import { z } from "astro/zod";
import { and, eq, ne } from "drizzle-orm";
import { siteConfig } from "@site-config";
import { requireUser } from "@/admin/auth/guard";
import { getDb } from "@/db";
import { formCheckbox, formText } from "@/lib/form-schema";
import { isValidSlug, slugify } from "@/lib/slug";
import { renderMarkdown } from "@/modules/media/lib/markdown";
import { catalogCategories, catalogItems } from "./db/schema";
import { AVAILABILITY } from "./options";

const fail = (message: string): never => {
  throw new ActionError({ code: "BAD_REQUEST", message });
};
/** True for SQLite unique-constraint failures (drizzle wraps them in `cause`). */
const isUniqueViolation = (error: unknown): boolean =>
  /UNIQUE constraint failed/i.test(`${error instanceof Error ? error.message : ""} ${error instanceof Error ? String(error.cause ?? "") : ""}`);

async function slugTaken(table: typeof catalogItems | typeof catalogCategories, slug: string, exceptId: string) {
  const [row] = await getDb()
    .select({ id: table.id })
    .from(table)
    .where(and(eq(table.slug, slug), exceptId ? ne(table.id, exceptId) : undefined))
    .limit(1);
  return Boolean(row);
}

const invalidate = (context: { cache: { invalidate(o: { tags: string[] }): Promise<void> } }) =>
  context.cache.invalidate({ tags: ["catalog", "sitemap"] });

/** "1.234,50" / "1234.5" / "12" → cents; "" → null; anything else → NaN. */
export function parsePriceCents(raw: string): number | null {
  const value = raw.replace(/\s|€/g, "");
  if (!value) return null;
  const normalized = /,\d{1,2}$/.test(value) ? value.replace(/\./g, "").replace(",", ".") : value.replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return Number.NaN;
  return Math.round(Number(normalized) * 100);
}

const localized = (field: string, max: number) =>
  Object.fromEntries(siteConfig.locales.map((lang) => [`${field}_${lang}`, formText(max)]));
const collect = (input: Record<string, unknown>, field: string) =>
  Object.fromEntries(siteConfig.locales.map((lang) => [lang, String(input[`${field}_${lang}`] ?? "")]));

/** `actions.catalog.*` — editors and up. */
export const actions = {
  saveItem: defineAction({
    accept: "form",
    input: z.object({
      id: formText(36),
      slug: formText(80),
      coverId: formText(36),
      /** Comma-separated media ids, in order. */
      gallery: formText(2000),
      categoryId: formText(36),
      price: formText(20),
      sku: formText(60),
      availability: z.enum(AVAILABILITY),
      sortOrder: formText(6),
      featured: formCheckbox(),
      published: formCheckbox(),
      ...localized("name", 200),
      ...localized("summary", 400),
      ...localized("content", 100_000),
      ...localized("priceNote", 30),
    }),
    handler: async (input, context) => {
      requireUser(context, "editor");
      const values = input as Record<string, unknown>;
      const name = collect(values, "name");
      if (!name[siteConfig.defaultLocale]) fail("nameRequired");

      const slug = input.slug ? input.slug.toLowerCase() : slugify(name[siteConfig.defaultLocale]!);
      if (!isValidSlug(slug)) fail("invalidSlug");
      if (await slugTaken(catalogItems, slug, input.id)) fail("slugTaken");
      const priceCents = parsePriceCents(input.price);
      if (Number.isNaN(priceCents)) fail("invalidPrice");

      const content = collect(values, "content");
      const contentHtml = Object.fromEntries(
        await Promise.all(Object.entries(content).map(async ([lang, markdown]) => [lang, markdown ? (await renderMarkdown(markdown)).html : ""])),
      );
      const row = {
        slug,
        name,
        summary: collect(values, "summary"),
        content,
        contentHtml,
        coverId: input.coverId || null,
        gallery: input.gallery.split(",").map((id) => id.trim()).filter((id) => /^[0-9a-f-]{36}$/.test(id)),
        categoryId: input.categoryId || null,
        priceCents,
        priceNote: collect(values, "priceNote"),
        sku: input.sku,
        availability: input.availability,
        featured: input.featured,
        published: input.published,
        sortOrder: Number(input.sortOrder) || 0,
        updatedAt: new Date(),
      };

      try {
        const id = input.id
          ? (await getDb().update(catalogItems).set(row).where(eq(catalogItems.id, input.id)).returning({ id: catalogItems.id }))[0]?.id
          : (await getDb().insert(catalogItems).values(row).returning({ id: catalogItems.id }))[0]?.id;
        if (!id) throw new ActionError({ code: "NOT_FOUND" });
        await invalidate(context);
        return { id };
      } catch (error) {
        if (error instanceof ActionError) throw error;
        if (isUniqueViolation(error)) fail("slugTaken"); // concurrent save race
        throw error;
      }
    },
  }),

  deleteItem: defineAction({
    accept: "form",
    input: z.object({ id: z.uuid() }),
    handler: async ({ id }, context) => {
      requireUser(context, "editor");
      await getDb().delete(catalogItems).where(eq(catalogItems.id, id));
      await invalidate(context);
      return { ok: true };
    },
  }),

  saveCategory: defineAction({
    accept: "form",
    input: z.object({ id: formText(36), slug: formText(80), sortOrder: formText(6), ...localized("name", 80) }),
    handler: async (input, context) => {
      requireUser(context, "editor");
      const name = collect(input as Record<string, unknown>, "name");
      if (!name[siteConfig.defaultLocale]) fail("nameRequired");
      const slug = input.slug ? input.slug.toLowerCase() : slugify(name[siteConfig.defaultLocale]!);
      if (!isValidSlug(slug)) fail("invalidSlug");
      if (await slugTaken(catalogCategories, slug, input.id)) fail("slugTaken");
      const row = { slug, name, sortOrder: Number(input.sortOrder) || 0 };
      try {
        if (input.id) await getDb().update(catalogCategories).set(row).where(eq(catalogCategories.id, input.id));
        else await getDb().insert(catalogCategories).values(row);
      } catch (error) {
        if (isUniqueViolation(error)) fail("slugTaken");
        throw error;
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
      await getDb().delete(catalogCategories).where(eq(catalogCategories.id, id));
      await invalidate(context);
      return { ok: true };
    },
  }),
};
