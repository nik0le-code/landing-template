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
- Deployment notes: `TZ` (blog/catalog publish times), `allowedDomains` for extra hostnames, single replica for media uploads
- Performance pass (Lighthouse on demo pages, JS budget), `CLAUDE.md` + README

### 15. Module: shopify
- Headless Storefront API client (retries, timeout, buyer IP, `@inContext` country/language); mock.shop in dev when unconfigured
- Listing (search, sort, Search & Discovery filters, cursor pagination), collections, product page with variant picker, recommendations, Product JSON-LD, sitemap
- Cart in Shopify, id in an httpOnly cookie: no-JS endpoint + `actions.shopify.cart`, drawer (`header.actions` slot), hosted checkout redirect
- Webhook with HMAC invalidates the `shopify` cache tag; module `csp` sources merged into astro.config.ts
- Motion ported from the Xristos store without a library: fly-to-cart arc, cart bounce, badge pop, spring drawers, line stagger/exit, lens zoom, cross-document view transitions (card image morph, card glide on sort/filter); filter rail with swatches, chips and a price slider

### 16. Commerce layer + WooCommerce
- `commerce` module owns every storefront page, component, cart session, checkout and motion; backends implement `CommerceProvider` (`ModuleServices` + `provides.commerce`)
- `shopify` reduced to a provider (hosted checkout); `woocommerce` provider on the Store API (Cart-Token sessions, attribute/stock/price facets, variations)
- Native checkout for Woo: address → shipping rates → offline payment methods → order, order confirmation (details only for the ordering browser), purchase tracking
- Module CSP entries accept `{env:NAME}`; verified against a local WordPress + WooCommerce in Docker
- Redirect payment gateways (Viva.com, bank gateways, PayPal): follow the gateway URL, keep the cart until paid, `/commerce/return` + WordPress bridge mu-plugin, order page states (paid / confirming / failed with retry); flow verified with a mock gateway that mirrors Viva's plugin
- `woocommerce.plugins` + `npm run wp:up / wp:plugins / wp:down / wp`: local Docker WordPress (bridge, WooCommerce, demo catalogue) and plugin sync (wordpress.org slugs, pinned versions, zips, `--ssh`, `--prune`)
- Payment method choice in config (`woocommerce.paymentMethods`, aliases `viva` / `epay`), labels for Viva.com and Piraeus ePay Paycenter; both plugins' failure paths verified with dummy credentials

### 17. Module: wordpress (content, plugins, shop as an option)
- Module system: `enables` (a module switches others on from its options), `internal` building blocks, route `when`, nested option defaults, conditional `publicNav`
- `wordpress` module: connection, `plugins`, `npm run wp:*` (moved from woocommerce), headless bridge v2 (Polylang REST fields and `?lang=`, signed change notifications, hidden system pages, shop redirects)
- Content: posts (list, categories, pagination, post page with TOC, RSS, latest on home) and pages (lowest-priority catch-all), translations/hreflang, Yoast SEO, sitemap, link rewriting, block styles, cache purge on publish
- `commerce` and `woocommerce` become internal: `wordpress: { shop: true }` or `shopify: true`; `WOOCOMMERCE_*` env names still read as fallbacks

### 18. Editable site pages + WordPress front end
- `getPageContent()` (core) + `provides.pageContent`: dictionary copy merged with CMS values field by field, images/galleries; pages using it become server-rendered + cached only while a provider is active (integration `astro:route:setup` + getStaticPaths strip)
- `src/config/editable-pages.ts`: page keys, paths, image slots; `npm run wp:fields` generates ACF (Secure Custom Fields) groups from the JSON copy (tabs, groups, repeaters, images, galleries) and creates the WordPress pages per language
- Bridge 2.2: field groups on the site pages, `headless/v1/page-content/<key>` endpoint, classic editor for them, "View page" links and front-end redirects to the site, cache purge on field saves

### 19. Module: strapi (alternative content backend)
- `strapi` module: posts, categories, pages (blocks rich text rendered from JSON, SEO component, localized with hreflang, sitemap, RSS, latest on home) and editable site pages (`provides.pageContent`), same routes and options as wordpress
- Lean Strapi 5 app in `src/modules/strapi/strapi`: production mode, SQLite, no users-permissions/cloud plugins, read-only API token, heap cap; ~200 MB idle
- `npm run strapi:up / strapi:fields / strapi:down / strapi:secrets / strapi`: Docker, first admin, token, `.env` wiring, demo content; site pages' single types + components generated from the copy (reserved names mapped, labels and placeholders from the code copy)
- Signed change notifications from a document-service middleware (debounced) → `/api/strapi/webhook`; module manifest `conflicts` (strapi ⟷ wordpress)

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
- [x] 9 Module: settings
- [x] 10 Module: blog
- [x] 11 Module: catalog
- [x] 12 Module: bookings
- [x] 13 Module CLI
- [x] 14 Production + docs
- [x] 15 Module: shopify
- [x] 16 Commerce layer + WooCommerce
- [x] 17 Module: wordpress
- [x] 18 Editable site pages + WordPress front end
- [x] 19 Module: strapi
