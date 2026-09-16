# landing-template

SEO- and performance-first landing page template: Astro 7 + Tailwind 4, Greek/English
out of the box, with optional modules (blog, products, leads, bookings, media,
settings) and a small admin backend — each switched on or off with one boolean.

Sibling of `frontend-template` (the React SaaS app template). Use this one for
marketing sites; use that one for portals.

## Quick start

```bash
cp .env.example .env
npm install
npm run dev                 # http://localhost:3000 → /el
```

Then, for a new client:

1. **`site.config.ts`** — name, domain, locales, contact details, socials, tracking ids.
2. **`src/styles/theme.css`** — brand colors, radius, font sizes.
3. **`public/favicon.svg`** + `npm run brand:assets` — favicons, app icons, OG image.
4. **`src/i18n/locales/{el,en}/*.json`** — all page copy.
5. **`src/config/navigation.ts`** — menu and footer links.
6. **`modules.config.ts`** — turn on what the site needs.

## Modules

One boolean each, in `modules.config.ts`:

| Module | Adds |
|---|---|
| `leads` | Contact/waitlist forms, spam protection, email notifications, admin inbox, CSV export |
| `media` | Image uploads, automatic AVIF/WebP versions, picker for other modules |
| `blog` | Posts per language linked as translations, Markdown editor, categories, RSS |
| `catalog` | Products/services with prices, gallery, categories (`basePath` sets the URL) |
| `bookings` | Appointment requests with rules, admin workflow, customer emails |
| `settings` | Announcement bar, socials and notification emails, editable without a redeploy |
| `example` | Reference module showing every extension point (keep off) |

A module that's off contributes **nothing**: no routes, admin pages, actions or
JavaScript. The admin area exists only when a module needs it. See
[`src/modules/README.md`](src/modules/README.md) for the module system and the CLI
(`module:list`, `module:new`, `module:remove`, `module:add`).

## How pages are rendered

- **Content pages are prerendered** at build time (HTML + every image size on disk),
  served in 2–3 ms with no per-request image work.
- **Database-driven pages** (blog, catalog, bookings, admin) are server-rendered and
  cached in memory; editing content clears exactly the affected cache tags.
- **Editable bits of static pages** (announcement, social links, latest posts,
  featured products) render as server islands, so admin edits appear without a rebuild.
- **JavaScript is opt-in.** A marketing page ships ~1 KB (menu behaviour + link
  prefetch). React loads only for admin islands (media picker, Markdown editor).

## Commands

```bash
npm run dev            # dev server
npm run build          # build + precompress static assets (gzip/brotli)
npm start              # production server (server.mjs)
npm run check          # astro check (types + templates) — the correctness gate

npm run db:generate    # migration after editing a db/schema.ts or adding a module
npm run db:migrate     # apply migrations (the app also does this on first request)
npm run db:studio      # browse the database

npm run admin:create -- --email you@client.gr --name "Your Name"
npm run module:list
npm run brand:assets   # favicons/OG image from public/favicon.svg
npm run demo:images    # placeholder images for the demo pages
```

## Deployment

Build the image (the canonical URL is baked into prerendered pages):

```bash
docker build --build-arg SITE_URL=https://www.client.gr -t client-site .
docker run -p 3000:3000 -v client-data:/app/data --env-file .env client-site
```

**Environment** (see `.env.example`): `SITE_URL`, `TZ`, `NOINDEX`, `DATABASE_URL`,
`UPLOADS_DIR`, `DB_MIGRATE_ON_START`, `ADMIN_SETUP_TOKEN`, `RESEND_API_KEY`, `EMAIL_FROM`.

**Kubernetes notes**

- **Volume:** mount one at `/app/data` (SQLite file + uploads).
- **Replicas:** keep **1** while the `media` module is on — uploads live on that
  volume. To scale out, move the database to a libSQL server (`libsql://…`), set
  `DB_MIGRATE_ON_START=false`, run `npm run db:migrate` as a job, and put media on
  shared storage (or implement the S3 driver behind `src/modules/media/lib/storage.ts`).
- **Probes:** `/api/health` (liveness), `/api/ready` (readiness, checks the database).
- **Behind an ingress:** `security.allowedDomains` in `astro.config.ts` is derived
  from the site URL. Add every hostname that serves the site (e.g. `www` and the bare
  domain), otherwise client IPs and origin checks fall back to the request host.
- **Staging:** `NOINDEX=true` → `noindex` headers on every response and a
  disallow-all `robots.txt`.
- **First admin:** `npm run admin:create` in a shell, or set `ADMIN_SETUP_TOKEN` and
  open `/admin/setup` (works only while no users exist).

The server (`server.mjs`) adds security headers, compression and cache headers to
both static files and rendered pages, so no extra proxy configuration is required.

## Tracking and consent

`site.config.ts` holds the GA4 / Google Ads ids and conversion labels. With
`consent.enabled`, nothing loads until the visitor agrees: Consent Mode v2 defaults to
denied, `gtag.js` is fetched only after opt-in, and "Reject all" is as prominent as
"Accept all". Fire conversions with `trackConversion("lead")` or `data-track-conversion`
attributes.

## Accessibility & SEO defaults

One `h1` per page, skip link, keyboard-friendly menus, `aria-current` navigation,
hreflang + `x-default`, canonical URLs, JSON-LD (Organization, Breadcrumb, FAQ,
Article, Product), sitemap with language alternates, RSS for the blog, and
`robots.txt`. Images carry width/height and lazy loading; the hero image is
prioritised. Reduced-motion is respected throughout.
