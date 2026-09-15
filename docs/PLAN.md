# landing-template — implementation plan

SEO- and performance-first landing page template (Astro), with optional
plug/unplug modules and a small admin backend. Sibling of `frontend-template`.

## Decisions (agreed)

| Topic | Decision |
|---|---|
| Framework | Astro 7 + `@astrojs/node` (standalone), shipped as a Docker image for Kubernetes |
| Rendering | Content pages prerendered at build (static HTML + build-time optimized images — on-demand `/_image` costs 100–400 ms CPU per request). DB-driven routes (blog, catalog, admin) server-rendered with Astro's route cache (`memoryCache` + tags, invalidated on admin edits); small dynamic bits on static pages via server islands |
| Islands | React, only where interactivity is needed. Default is `.astro` = zero JS |
| Styling | Tailwind 4, per-client theme tokens in one CSS file |
| Data | Drizzle + `@libsql/client` — `file:` URL (single replica + PVC) or `libsql://` (sqld/Turso, multi-replica) |
| Auth | Own admin auth: scrypt hashes, DB sessions, httpOnly cookies, login rate limit |
| Media | Local volume (PVC) behind a storage interface; sharp → AVIF/WebP variants |
| Email | Resend (optional — submissions are always stored in DB) |
| Tracking | GA4 / Google Ads + conversions, loaded after consent, Consent Mode v2 banner (can be disabled) |
| i18n | All URLs prefixed (`/el/…`, `/en/…`), `/` redirects to default (`el`); hreflang + x-default |
| Modules | `src/modules/<name>/` self-contained; switched on/off only in `modules.config.ts` (one boolean per module, options separate). Disabled modules are never imported (generated registry), so they add nothing to the build. Migrations cover every module's tables, so toggling needs no DB step. CLI for scaffolding/cleanup |
| Package manager | npm |
| k8s manifests | Out of scope for now (Dockerfile only) |

## Segments

Each segment ends with `npm run check` + `npm run build` passing and a short review
before moving on.

### 0. Foundation
- `package.json` scripts, `tsconfig` (strict, `@/` alias), `.gitignore` (`.idea`, `data/`, `.env`)
- `astro.config.ts`: node adapter, React, Tailwind vite plugin, i18n, cache provider, fonts, env schema
- `site.config.ts` (name, url, locales, contact, socials, tracking, consent, modules options)
- Tailwind theme tokens (`src/styles/theme.css`), global styles
- Placeholder page per locale; `/` → default-locale redirect

### 1. i18n + SEO core
- Locale dictionaries + typed `t()`; locale helpers (`localizedPath`, switcher URLs)
- `BaseLayout` with `<Seo>` (title template, description, canonical, hreflang, OG/Twitter, robots)
- JSON-LD helpers (Organization, LocalBusiness, WebSite, FAQPage, Article, Breadcrumb, Product)
- `sitemap.xml` + `robots.txt` endpoints (static pages auto-discovered, modules contribute entries; `NOINDEX` env for staging)
- 404 page, default OG image

### 2. UI kit + layout shell
- Primitives: Container, Section, Heading, Button/LinkButton, Badge, Card, Icon, Input/Textarea/Select, Prose
- Navbar (sticky, mobile menu without React, language switcher), Footer, AnnouncementBar, SkipLink, Breadcrumbs
- Lightweight effects: Reveal (IntersectionObserver + CSS, reduced-motion aware), Marquee, gradient/grid backgrounds

### 3. Sections library + demo pages
- Hero (centered, split), Features grid, Bento, Steps, Stats, LogoCloud, Testimonials, Pricing,
  Team, Timeline, FAQ (+ JSON-LD), CTA, ContactSection, Gallery, LegalPage
- Demo pages: home, about, privacy, terms — composed from sections, copy in locale files

### 4. Tracking & consent
- Consent banner (vanilla, no React), Consent Mode v2 defaults, persisted choice, re-open link in footer
- GA4 / Ads loader (deferred, after consent), `trackConversion()` / `trackEvent()` helpers

### 5. Data layer + module system
- libSQL/Drizzle client, core schema, migrations applied on startup, `db:*` scripts
- Module manifest contract (routes, admin nav, dashboard widgets, slots, sitemap entries, cache tags)
- Registry `src/modules/index.ts` + Astro integration injecting module routes
- `<ModuleSlot>` so core pages embed module UI without importing modules directly

### 6. Admin core
- Admin area exists only when an enabled module declares `"admin": true` (no /admin, auth or DB code otherwise)
- Auth (users, sessions, scrypt), middleware guard for `/admin` + `/api/admin`, login/logout, rate limit, browser setup via ADMIN_SETUP_TOKEN
- Admin shell layout (sidebar from module registry), dashboard, account/password, user management
- `npm run admin:create` CLI

### 7. Media library (module `media`)
- Storage interface + local-volume driver, upload endpoint, sharp variants, `/media/*` serving with long cache
- `<MediaImage>` (srcset/sizes), admin media picker (React island)

### 8. Module: leads
- Contact / waitlist forms via Astro Actions (works without JS), honeypot + timing + rate limit
- Resend notification, admin inbox (list, detail, status, CSV export), conversion event on success

### 9. Module: settings
- Editable announcement bar, socials, notification recipients; `getSettings()` merges DB over `site.config`
- Values shown on prerendered pages render through server islands (`server:defer`) so edits apply without a rebuild; SEO-critical NAP data stays in `site.config`

### 10. Module: blog
- Per-locale posts linked by translation group, markdown editor with preview, cover image, draft/publish
- Public list (pagination, categories) + post page (Article JSON-LD, hreflang between translations), sitemap entries, cache invalidation

### 11. Module: catalog
- Items/categories with per-locale fields, images, price, ordering, published flag; public list + detail (Product JSON-LD)

### 12. Module: bookings
- Public booking request form (optionally linked to catalog items), admin list with status workflow, email notification

### 13. Module CLI
- `module:list` (available vs enabled), `module:new <name>` (scaffold from the example module / CRUD template)
- `module:remove <name>` (disable in config + delete the folder for projects that will never use it), `module:add <name>` (restore a folder from the template remote/path)

### 14. Production + docs
- Dockerfile (multi-stage, non-root, `/data` volume), `/api/health`
- Memory: glibc allocator tuning for sharp in Docker (`MALLOC_ARENA_MAX=2` or jemalloc); measure idle RSS (~205 MB locally)
- Custom Node entry (adapter `middleware` mode) so security headers, `X-Robots-Tag` on NOINDEX deployments and long-lived cache headers also apply to prerendered/static files
- Performance pass (Lighthouse on demo pages, JS budget), `CLAUDE.md` + README

## Progress

- [x] 0 Foundation
- [x] 1 i18n + SEO core
- [x] 2 UI kit + layout shell
- [x] 3 Sections library + demo pages
- [x] 4 Tracking & consent
- [x] 5 Data layer + module system
- [x] 6 Admin core
- [x] 7 Media library
- [x] 8 Module: leads
- [ ] 9 Module: settings
- [ ] 10 Module: blog
- [ ] 11 Module: catalog
- [ ] 12 Module: bookings
- [ ] 13 Module CLI
- [ ] 14 Production + docs
