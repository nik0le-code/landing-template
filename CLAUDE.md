# CLAUDE.md

Guidance for AI agents working in this repository. Read this before adding a feature.

## Scope of this document

This describes the **landing-template** architecture and applies to **any site
generated from it** (client landing pages). The *patterns* below — rendering model,
module system, i18n, SEO, admin auth, caching — are stable across derived projects.

The **specifics differ per project** and must be discovered, not assumed:

- **Enabled modules.** `modules.config.ts` is the single source of truth. Never
  assume `blog` or `leads` exist; check the config first.
- **Copy and pages.** Client sites replace `src/i18n/locales/*` and often add pages
  under `src/pages/[lang]/`.
- **Locales.** `site.config.ts` defines them (template ships `el` + `en`).

```bash
cat modules.config.ts                 # which modules this site uses
ls src/pages/\[lang\]                 # this site's pages
ls src/modules                        # module folders present
cat package.json | sed -n '/"scripts"/,/}/p'
```

The sibling `frontend-template` is the React SaaS app template; this is the
marketing-site one. They share conventions (snake_case API fields, Zod-first types)
but no code.

## Stack

Astro 7 (Node adapter, middleware mode + `server.mjs`) · TypeScript strict ·
Tailwind 4 · Drizzle + libSQL/SQLite · React only for admin islands · sharp ·
Resend (HTTP API) · GA4/Ads with Consent Mode v2.

**A fresh clone is configured with `npm run setup`** (client name, domain,
languages, brand colour, modules, first admin — all available as flags plus
`--yes` for unattended runs). It rewrites the config files rather than
scaffolding new ones, so it is safe to run once, at the start.

**`npm run check` (astro check) is the correctness gate — run it after every change.**
Then `npm run build` for anything touching rendering, modules or the server.

## Rendering model (the reason this template exists)

| Kind of page | How | Why |
|---|---|---|
| Content pages (`src/pages/[lang]/*.astro`) | `export const prerender = true` + `getStaticPaths = () => localeStaticPaths()` | HTML and every image size are built once; ~2–3 ms responses, no per-request sharp work |
| DB-driven pages (module routes) | `export const prerender = false` + `Astro.cache.set({ maxAge, swr, tags })` | Fresh content, cached per pod, invalidated by tag on save |
| Editable bits of static pages | `<Component server:defer />` (server island) | Admin edits appear without a rebuild |
| Admin | server-rendered, `no-store` | Never cached |

Rules that follow from this:

- **Never** add on-demand rendering to a content page just to read the database;
  use a server island for that part instead.
- Anything in an island must take `lang` as a prop — islands don't see the page URL.
- After a mutation, invalidate: `await context.cache.invalidate({ tags: ["blog", "sitemap"] })`.
- Prerendered pages bake in `SITE_URL`; keep `siteConfig.url` correct.

## Module system

Everything optional lives in `src/modules/<name>/` and is switched in
`modules.config.ts`. Disabled modules are **structurally excluded**: the integration
(`src/integrations/modules.ts`) generates `src/modules/.generated/*` with static
imports of enabled modules only.

- Read [`src/modules/README.md`](src/modules/README.md) before writing a module.
- **Core never imports a module.** Core pages expose `<ModuleSlot name="…">`;
  modules fill slots, add `publicNav`/`adminNav`, `sitemap()` entries and services
  (`provides.siteSettings`). A module may import another only via `dependsOn`.
- Scaffold with `npm run module:new -- <name>`; copy `src/modules/example` for
  reference.
- `module.json` route patterns may use `{option}` placeholders (`optionDefaults`
  holds the fallback).
- Adding/editing a `db/schema.ts` → `npm run db:generate` (migrations cover every
  module folder, so toggling a module needs no DB step).

## Forms and actions

Astro Actions (`accept: "form"`) so forms work **without JavaScript**; progressive
enhancement adds inline errors and conversion tracking.

- **Always use `src/lib/form-schema.ts`** (`formText`, `formRequiredText`, `formUrl`,
  `formLink`, `formCheckbox`). Astro turns empty fields into `null` unless the
  outermost schema is `.optional()`, so `z.string().default("")` **rejects empty
  input**, and it treats any present checkbox field as checked.
- Error messages are translation keys (`admin.errors.*` or a module's `admin.*`),
  translated by `formErrors` / `moduleFormErrors`.
- Public pages are prerendered and cannot receive POSTs: post to a module page
  (`/[lang]/lead/submit`) or an endpoint, then redirect.
- Admin actions start with `requireUser(context, "editor" | "admin" | "owner")` —
  the middleware guard is not enough, actions are callable directly.

## Auth and admin

- The admin area exists only when an enabled module declares `"admin": true`.
- scrypt password hashes; sessions are random tokens stored as SHA-256; cookies are
  httpOnly/SameSite=Lax/Secure (except localhost).
- Roles: `owner > admin > editor` (`hasRole`). Never let a user change their own role,
  and keep at least one active owner.
- Rate limiting: `consume()` from `src/lib/rate-limit.ts`. Count **stored** results
  strictly and attempts loosely, so validation errors don't lock people out.

## i18n

- `useTranslations(lang)` for UI strings (typed keys), `getDictionary(lang)` for
  structured page copy, `translateModule(lang, "<module>", key)` inside modules,
  `pickLocalized(value, lang)` for per-locale DB columns.
- URLs are always prefixed (`/el/…`, `/en/…`); build links with `localizePath`.
- `locals.lang` is set by middleware. Add new strings to **every** locale file — a
  missing key is a type error.

## SEO

`PageLayout` takes `seo` (title, description, image, `alternates`, `noindex`) and
`schema` (JSON-LD nodes from `src/lib/seo/schema.ts`) plus `breadcrumbs` (rendered and
emitted as BreadcrumbList from the same list).

- Exactly one `<h1>` per page.
- Pages whose slugs differ per locale must pass their own `alternates` map.
- Modules add dynamic URLs through `sitemap()`; static pages are discovered automatically.
- `NOINDEX=true` (staging) → noindex headers everywhere + disallow-all robots.txt.

## Media

`media` module: uploads are validated by decoding, stripped of metadata, resized to
AVIF/WebP at several widths **once** and served from disk with immutable caching.
Use `<MediaImage media={…} sizes priority />`, `<MediaField>` (one image) and
`<MediaGalleryInput>` (ordered list) in forms; `getMediaMap(ids)` to avoid N queries.
Rich text goes through `renderMarkdown()` (sanitized HTML stored on save).

## Conventions

- **Tailwind tokens only** (`bg-primary`, `text-muted-foreground`), never raw colors —
  rebranding is one file.
- `.astro` by default; React (`client:visible`/`client:load`) only where admin
  interactivity needs it.
- Effects are CSS-first (scroll-driven reveal, marquee); respect reduced motion.
- `content-visibility` (`lazyRender`) is opt-in — it breaks in-page anchor links.
- Database columns and form fields: snake_case in SQL, camelCase in TypeScript
  (Drizzle maps them).
- Keep secrets in `astro:env/server` (`access: "secret"` = read at runtime).

## Adding a feature — checklist

1. Check `modules.config.ts` and `ls src/modules` for what exists.
2. Decide: content page (prerender), module route (SSR + cache tags), or server island.
3. Reuse sections in `src/components/sections/` and UI in `src/components/ui/`.
4. New strings → every locale file. New DB fields → `npm run db:generate`.
5. Forms → Actions + `form-schema` helpers; admin actions → `requireUser`.
6. Invalidate cache tags after mutations.
7. `npm run check`, then `npm run build`; for user-visible changes, verify a page in
   the browser (no console errors, no layout shift, no horizontal scroll at 375px).
