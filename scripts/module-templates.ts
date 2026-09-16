/**
 * File templates used by `npm run module:new`. The scaffold is a working content
 * module (table + admin CRUD + public list/detail + i18n + sitemap) modelled on the
 * catalog module, minus the media dependency.
 */
export interface TemplateNames {
  /** Folder/module name, kebab-case: "case-studies". */
  name: string;
  /** Route base: "case-studies". */
  basePath: string;
  /** camelCase identifier: "caseStudies". */
  camel: string;
  /** Table prefix, snake_case: "case_studies". */
  snake: string;
  /** Human label: "Case studies". */
  label: string;
}

export function moduleFiles(n: TemplateNames): Record<string, string> {
  return {
    "module.json": `{
  "name": "${n.name}",
  "description": "TODO: describe what this module adds.",
  "admin": true,
  "dependsOn": [],
  "optionDefaults": { "basePath": "${n.basePath}" },
  "routes": [
    { "pattern": "/[lang]/{basePath}", "entrypoint": "./pages/list.astro" },
    { "pattern": "/[lang]/{basePath}/[slug]", "entrypoint": "./pages/detail.astro" },
    { "pattern": "/admin/${n.name}", "entrypoint": "./pages/admin/index.astro" },
    { "pattern": "/admin/${n.name}/new", "entrypoint": "./pages/admin/edit.astro" },
    { "pattern": "/admin/${n.name}/[id]", "entrypoint": "./pages/admin/edit.astro" }
  ]
}
`,

    "options.ts": `/** \`modules.config.ts\` → \`options: { ${n.camel}: { … } }\` */
export interface ${cap(n.camel)}Options {
  /** URL segment: /[lang]/<basePath>. */
  basePath: string;
}

export const ${n.camel}Defaults: ${cap(n.camel)}Options = {
  basePath: "${n.basePath}", // keep in sync with optionDefaults in module.json
};

declare module "@/modules/types" {
  interface ModuleOptionsMap {
    "${n.name}": ${cap(n.camel)}Options;
  }
}
`,

    "db/schema.ts": `import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/** Import only from drizzle-orm here — drizzle-kit loads this file directly. */
export const ${n.camel}Items = sqliteTable(
  "${n.snake}_items",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    slug: text("slug").notNull().unique(),
    /** Per-locale values: { el: "…", en: "…" }. */
    title: text("title", { mode: "json" }).$type<Record<string, string>>().notNull(),
    body: text("body", { mode: "json" }).$type<Record<string, string>>().notNull().default(sql\`'{}'\`),
    published: integer("published", { mode: "boolean" }).notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql\`(unixepoch())\`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql\`(unixepoch())\`),
  },
  (table) => [index("${n.snake}_listing_idx").on(table.published, table.sortOrder)],
);

export type ${cap(n.camel)}Item = typeof ${n.camel}Items.$inferSelect;
`,

    "lib/queries.ts": `import { and, asc, eq } from "drizzle-orm";
import { siteConfig } from "@site-config";
import { getDb } from "@/db";
import { getModuleOptions } from "@/modules/registry";
import { ${n.camel}Items } from "../db/schema";
import { ${n.camel}Defaults } from "../options";

export const ${n.camel}Options = () => getModuleOptions("${n.name}", ${n.camel}Defaults);

export const ${n.camel}Path = (lang: string, slug?: string) =>
  \`/\${lang}/\${${n.camel}Options().basePath}\${slug ? \`/\${slug}\` : ""}\`;

export const listPublished = () =>
  getDb().select().from(${n.camel}Items).where(eq(${n.camel}Items.published, true)).orderBy(asc(${n.camel}Items.sortOrder)).limit(200);

export async function getPublished(slug: string) {
  const [row] = await getDb()
    .select()
    .from(${n.camel}Items)
    .where(and(eq(${n.camel}Items.published, true), eq(${n.camel}Items.slug, slug)))
    .limit(1);
  return row ?? null;
}

export const listAll = () => getDb().select().from(${n.camel}Items).orderBy(asc(${n.camel}Items.sortOrder)).limit(500);

export async function getItem(id: string) {
  const [row] = await getDb().select().from(${n.camel}Items).where(eq(${n.camel}Items.id, id)).limit(1);
  return row ?? null;
}

export async function sitemapEntries() {
  const items = await listPublished();
  const paths = (slug?: string) => Object.fromEntries(siteConfig.locales.map((l) => [l, ${n.camel}Path(l, slug)]));
  return [{ paths: paths() }, ...items.map((item) => ({ paths: paths(item.slug), lastModified: item.updatedAt }))];
}
`,

    "actions.ts": `import { ActionError, defineAction } from "astro:actions";
import { z } from "astro/zod";
import { and, eq, ne } from "drizzle-orm";
import { siteConfig } from "@site-config";
import { requireUser } from "@/admin/auth/guard";
import { getDb } from "@/db";
import { formCheckbox, formText } from "@/lib/form-schema";
import { isValidSlug, slugify } from "@/lib/slug";
import { ${n.camel}Items } from "./db/schema";

const fail = (message: string): never => {
  throw new ActionError({ code: "BAD_REQUEST", message });
};
const localized = (field: string, max: number) =>
  Object.fromEntries(siteConfig.locales.map((lang) => [\`\${field}_\${lang}\`, formText(max)]));
const collect = (input: Record<string, unknown>, field: string) =>
  Object.fromEntries(siteConfig.locales.map((lang) => [lang, String(input[\`\${field}_\${lang}\`] ?? "")]));

/** \`actions["${n.name}"].*\` — editors and up. */
export const actions = {
  save: defineAction({
    accept: "form",
    input: z.object({
      id: formText(36),
      slug: formText(80),
      sortOrder: formText(6),
      published: formCheckbox(),
      ...localized("title", 200),
      ...localized("body", 20_000),
    }),
    handler: async (input, context) => {
      requireUser(context, "editor");
      const values = input as Record<string, unknown>;
      const title = collect(values, "title");
      if (!title[siteConfig.defaultLocale]) fail("titleRequired");

      const slug = input.slug ? input.slug.toLowerCase() : slugify(title[siteConfig.defaultLocale]!);
      if (!isValidSlug(slug)) fail("invalidSlug");
      const [taken] = await getDb()
        .select({ id: ${n.camel}Items.id })
        .from(${n.camel}Items)
        .where(and(eq(${n.camel}Items.slug, slug), input.id ? ne(${n.camel}Items.id, input.id) : undefined))
        .limit(1);
      if (taken) fail("slugTaken");

      const row = {
        slug,
        title,
        body: collect(values, "body"),
        published: input.published,
        sortOrder: Number(input.sortOrder) || 0,
        updatedAt: new Date(),
      };
      const id = input.id
        ? (await getDb().update(${n.camel}Items).set(row).where(eq(${n.camel}Items.id, input.id)).returning({ id: ${n.camel}Items.id }))[0]?.id
        : (await getDb().insert(${n.camel}Items).values(row).returning({ id: ${n.camel}Items.id }))[0]?.id;
      if (!id) throw new ActionError({ code: "NOT_FOUND" });
      await context.cache.invalidate({ tags: ["${n.name}", "sitemap"] });
      return { id };
    },
  }),

  delete: defineAction({
    accept: "form",
    input: z.object({ id: z.uuid() }),
    handler: async ({ id }, context) => {
      requireUser(context, "editor");
      await getDb().delete(${n.camel}Items).where(eq(${n.camel}Items.id, id));
      await context.cache.invalidate({ tags: ["${n.name}", "sitemap"] });
      return { ok: true };
    },
  }),
};
`,

    "index.ts": `import { moduleOptions } from "../.generated/registry";
import { defineModuleRuntime } from "../define";
import el from "./i18n/el.json";
import en from "./i18n/en.json";
import "./options";

export default defineModuleRuntime({
  name: "${n.name}",
  publicNav: [
    { path: () => \`/\${(moduleOptions["${n.name}"]?.basePath as string | undefined) ?? "${n.basePath}"}\`, label: { el: el.title, en: en.title } },
  ],
  adminNav: [{ href: "/admin/${n.name}", label: { en: en.title, el: el.title }, icon: "layers", order: 50 }],
  sitemap: async () => (await import("./lib/queries")).sitemapEntries(),
  i18n: { el, en },
});
`,

    "i18n/el.json": `{
  "title": "${n.label}",
  "description": "TODO: σύντομη περιγραφή.",
  "empty": "Δεν υπάρχει ακόμα περιεχόμενο.",
  "admin": {
    "title": "${n.label}",
    "new": "Νέα καταχώριση",
    "edit": "Επεξεργασία",
    "titleField": "Τίτλος ({lang})",
    "body": "Κείμενο ({lang})",
    "slug": "Slug (διεύθυνση)",
    "slugHint": "Κοινό για όλες τις γλώσσες. Κενό = αυτόματα από τον τίτλο.",
    "sortOrder": "Σειρά",
    "published": "Δημοσιευμένο",
    "hidden": "Κρυφό",
    "save": "Αποθήκευση",
    "empty": "Δεν υπάρχουν καταχωρίσεις.",
    "slugTaken": "Υπάρχει ήδη καταχώριση με αυτό το slug.",
    "invalidSlug": "Μη έγκυρο slug.",
    "titleRequired": "Ο τίτλος στην κύρια γλώσσα είναι υποχρεωτικός."
  }
}
`,

    "i18n/en.json": `{
  "title": "${n.label}",
  "description": "TODO: short description.",
  "empty": "No content yet.",
  "admin": {
    "title": "${n.label}",
    "new": "New entry",
    "edit": "Edit",
    "titleField": "Title ({lang})",
    "body": "Text ({lang})",
    "slug": "Slug (URL)",
    "slugHint": "Shared by all languages. Empty = generated from the title.",
    "sortOrder": "Order",
    "published": "Published",
    "hidden": "Hidden",
    "save": "Save",
    "empty": "No entries.",
    "slugTaken": "An entry with this slug already exists.",
    "invalidSlug": "Invalid slug.",
    "titleRequired": "The title in the main language is required."
  }
}
`,

    "pages/list.astro": `---
import { siteConfig } from "@site-config";
import { pickLocalized } from "@/i18n";
import { translateModule } from "@/modules/registry";
import PageLayout from "@/layouts/PageLayout.astro";
import Card from "@/components/ui/Card.astro";
import Section from "@/components/ui/Section.astro";
import SectionHeading from "@/components/ui/SectionHeading.astro";
import { listPublished, ${n.camel}Path } from "../lib/queries";

export const prerender = false;

const lang = Astro.locals.lang;
const t = (key: string) => translateModule(lang, "${n.name}", key);
const items = await listPublished();

Astro.cache.set({ maxAge: 300, swr: 3600, tags: ["${n.name}"] });
---

<PageLayout
  seo={{ title: t("title"), description: t("description"), alternates: Object.fromEntries(siteConfig.locales.map((l) => [l, ${n.camel}Path(l)])) }}
  breadcrumbs={[{ name: t("title"), path: ${n.camel}Path(lang) }]}
>
  <Section spacing="sm">
    <SectionHeading tag="h1" title={t("title")} description={t("description")} align="left" />
    {
      items.length === 0 ? (
        <p class="mt-10 text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul class="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <li>
              <Card as="article" interactive class="h-full">
                <h2 class="text-lg font-semibold">
                  <a href={${n.camel}Path(lang, item.slug)} class="after:absolute after:inset-0">{pickLocalized(item.title, lang)}</a>
                </h2>
              </Card>
            </li>
          ))}
        </ul>
      )
    }
  </Section>
</PageLayout>
`,

    "pages/detail.astro": `---
import { siteConfig } from "@site-config";
import { pickLocalized } from "@/i18n";
import { translateModule } from "@/modules/registry";
import PageLayout from "@/layouts/PageLayout.astro";
import Prose from "@/components/ui/Prose.astro";
import Section from "@/components/ui/Section.astro";
import { getPublished, ${n.camel}Path } from "../lib/queries";

export const prerender = false;

const lang = Astro.locals.lang;
const t = (key: string) => translateModule(lang, "${n.name}", key);
const item = await getPublished(Astro.params.slug ?? "");
if (!item) return Astro.rewrite("/404");

const title = pickLocalized(item.title, lang);

Astro.cache.set({ maxAge: 300, swr: 3600, tags: ["${n.name}"] });
---

<PageLayout
  seo={{ title, alternates: Object.fromEntries(siteConfig.locales.map((l) => [l, ${n.camel}Path(l, item.slug)])) }}
  breadcrumbs={[{ name: t("title"), path: ${n.camel}Path(lang) }, { name: title, path: ${n.camel}Path(lang, item.slug) }]}
>
  <Section width="sm">
    <h1 class="text-4xl font-bold tracking-tight text-balance">{title}</h1>
    <Prose class="mt-8"><p class="whitespace-pre-wrap">{pickLocalized(item.body, lang)}</p></Prose>
  </Section>
</PageLayout>
`,

    "pages/admin/index.astro": `---
import Plus from "@lucide/astro/icons/plus";
import { pickLocalized } from "@/i18n";
import { translateModule } from "@/modules/registry";
import AdminLayout from "@/admin/layouts/AdminLayout.astro";
import Panel from "@/admin/components/Panel.astro";
import Badge from "@/components/ui/Badge.astro";
import Button from "@/components/ui/Button.astro";
import { listAll } from "../../lib/queries";

const lang = Astro.locals.lang;
const tm = (key: string) => translateModule(lang, "${n.name}", key);
const items = await listAll();
---

<AdminLayout title={tm("admin.title")}>
  <Button slot="actions" href="/admin/${n.name}/new"><Plus /> {tm("admin.new")}</Button>
  {
    items.length === 0 ? (
      <Panel><p class="text-muted-foreground">{tm("admin.empty")}</p></Panel>
    ) : (
      <div class="relative overflow-x-auto rounded-lg border border-border bg-card">
        <table class="w-full text-left text-sm">
          <tbody class="divide-y divide-border">
            {items.map((item) => (
              <tr>
                <td class="px-4 py-3">
                  <a href={\`/admin/${n.name}/\${item.id}\`} class="font-medium hover:text-primary">{pickLocalized(item.title, lang)}</a>
                  <p class="text-xs text-muted-foreground">/{item.slug}</p>
                </td>
                <td class="px-4 py-3">
                  <Badge variant={item.published ? "success" : "outline"}>{item.published ? tm("admin.published") : tm("admin.hidden")}</Badge>
                </td>
                <td class="px-4 py-3 text-right text-muted-foreground">#{item.sortOrder}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }
</AdminLayout>
`,

    "pages/admin/edit.astro": `---
import { actions } from "astro:actions";
import { siteConfig } from "@site-config";
import { pickLocalized, useTranslations } from "@/i18n";
import { translateModule } from "@/modules/registry";
import AdminLayout from "@/admin/layouts/AdminLayout.astro";
import FormAlert from "@/admin/components/FormAlert.astro";
import Panel from "@/admin/components/Panel.astro";
import { moduleFormErrors } from "@/admin/lib/forms";
import Button from "@/components/ui/Button.astro";
import Field from "@/components/ui/Field.astro";
import Input from "@/components/ui/Input.astro";
import Textarea from "@/components/ui/Textarea.astro";
import { getItem } from "../../lib/queries";

const lang = Astro.locals.lang;
const t = useTranslations(lang);
const tm = (key: string, params?: Record<string, string>) => translateModule(lang, "${n.name}", key, params);

const saved = Astro.getActionResult(actions["${n.name}"].save);
const deleted = Astro.getActionResult(actions["${n.name}"].delete);
if (saved && !saved.error) return Astro.redirect(\`/admin/${n.name}/\${saved.data.id}?flash=saved\`, 303);
if (deleted && !deleted.error) return Astro.redirect("/admin/${n.name}?flash=deleted", 303);

const item = Astro.params.id ? await getItem(Astro.params.id) : null;
if (Astro.params.id && !item) return Astro.rewrite("/404");
const errors = moduleFormErrors(lang, "${n.name}", saved?.error);
const action = \`\${item ? \`/admin/${n.name}/\${item.id}\` : "/admin/${n.name}/new"}\${actions["${n.name}"].save}\`;
---

<AdminLayout
  title={item ? tm("admin.edit") : tm("admin.new")}
  description={item ? pickLocalized(item.title, lang) : undefined}
  back={{ href: "/admin/${n.name}", label: tm("admin.title") }}
>
  <form method="POST" action={action} class="grid max-w-3xl gap-6">
    <input type="hidden" name="id" value={item?.id ?? ""} />
    <FormAlert message={errors.form} />
    {
      siteConfig.locales.map((l) => (
        <Panel title={t(\`common.localeNames.\${l}\`)}>
          <div class="space-y-5">
            <Field id={\`title_\${l}\`} label={tm("admin.titleField", { lang: l.toUpperCase() })} required={l === siteConfig.defaultLocale}>
              <Input id={\`title_\${l}\`} name={\`title_\${l}\`} value={item?.title[l] ?? ""} maxlength={200} lang={l} required={l === siteConfig.defaultLocale} />
            </Field>
            <Field id={\`body_\${l}\`} label={tm("admin.body", { lang: l.toUpperCase() })}>
              <Textarea id={\`body_\${l}\`} name={\`body_\${l}\`} rows={8} lang={l}>{item?.body[l] ?? ""}</Textarea>
            </Field>
          </div>
        </Panel>
      ))
    }
    <Panel>
      <div class="space-y-5">
        <Field id="slug" label={tm("admin.slug")} hint={tm("admin.slugHint")} error={errors.fields.slug}>
          <Input id="slug" name="slug" value={item?.slug ?? ""} maxlength={80} pattern="[a-z0-9]+(-[a-z0-9]+)*" class="font-mono text-sm" />
        </Field>
        <Field id="sortOrder" label={tm("admin.sortOrder")}>
          <Input id="sortOrder" name="sortOrder" type="number" value={String(item?.sortOrder ?? 0)} />
        </Field>
        <label class="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" name="published" checked={item?.published ?? false} class="size-4 accent-primary" />
          {tm("admin.published")}
        </label>
        <Button type="submit">{tm("admin.save")}</Button>
      </div>
    </Panel>
  </form>

  {
    item && (
      <form method="POST" action={\`/admin/${n.name}/\${item.id}\${actions["${n.name}"].delete}\`} data-confirm={t("admin.common.confirmDelete")} class="mt-6">
        <input type="hidden" name="id" value={item.id} />
        <Button type="submit" variant="destructive">{t("admin.common.delete")}</Button>
      </form>
    )
  }
</AdminLayout>
`,
  };
}

const cap = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);
