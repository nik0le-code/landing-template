# Landing Template

> Astro 7 + Tailwind 4 landing-page template — SEO-first, zero JavaScript by default,
> Greek/English out of the box, with plug-in modules (blog, products, leads, bookings,
> media, settings) and a small admin backend.

Sibling of `frontend-template` (the React SaaS app template). Use this one for
marketing sites; use that one for portals.

## 🚀 Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Configure the site for the client (interactive)
npm run setup

# 3. Start the dev server
npm run dev                  # http://localhost:3000 → /el
```

`npm run setup` is the whole "new client" checklist in one command. It asks for the
site name, domain, languages, brand colour, contact details and modules, then:

- rewrites `site.config.ts`, `src/styles/theme.css`, `modules.config.ts` and `.env`
- deletes the copy, legal pages and dictionaries of languages you dropped
- replaces the "Acme" demo text, regenerates favicons + OG image
- renames the git remote (`origin` → `template`) and adds the client's repo
- creates the first admin user

Every question is also a flag, so it can run unattended:

```bash
npm run setup -- --name "Ανθός Florist" --domain https://www.anthos.gr \
  --locales el --color "#2f855a" --email hello@anthos.gr --modules blog,leads \
  --admin-email me@agency.gr --origin git@github.com:agency/anthos-site.git --yes
```

After that you only touch content: `src/i18n/locales/*` (all page copy),
`src/config/navigation.ts` (menu), `src/assets/demo/` (images) and
`src/content/legal/` (privacy/terms).

## 📁 Project Structure

```
src/
├── pages/
│   ├── [lang]/              # the actual site pages (prerendered)
│   │   ├── index.astro      # home, about, services, contact, privacy, terms
│   │   └── …
│   ├── sitemap.xml.ts       # sitemap, robots.txt, webmanifest
│   └── dev/ui-kit.astro     # every component on one page (dev only)
├── layouts/
│   └── PageLayout.astro     # <head>, SEO, JSON-LD, header/footer, skip link
├── components/
│   ├── sections/            # Hero, FeatureGrid, Pricing, Faq, Testimonials, Cta…
│   ├── ui/                  # Button, Card, Input, Field, Section, Container…
│   ├── layout/              # header, footer, navigation
│   ├── seo/                 # meta tags, JSON-LD
│   ├── effects/             # CSS-first reveal/marquee (reduced-motion aware)
│   └── modules/             # ModuleSlot — where modules inject content
├── i18n/
│   ├── index.ts             # useTranslations, getDictionary, localizePath…
│   └── locales/{el,en}/     # ALL page copy, one JSON per page
├── config/navigation.ts     # menu + footer links
├── modules/                 # optional features (see below)
├── admin/                   # admin shell, auth, components (exists only if a module needs it)
├── styles/theme.css         # brand tokens — the one file you re-theme
├── lib/                     # seo, tracking, form-schema, cn, rate-limit
└── db/                      # Drizzle schema + migrations

site.config.ts               # name, domain, locales, contact, socials, tracking ids
modules.config.ts            # which features exist — one boolean each
```

## 📄 Adding a Page

### 1. Create the page

**File:** `src/pages/[lang]/pricing.astro`

```astro
---
import PageLayout from "@/layouts/PageLayout.astro";
import Pricing from "@/components/sections/Pricing.astro";
import Faq from "@/components/sections/Faq.astro";
import { getDictionary, localeStaticPaths, localizePath } from "@/i18n";

// Static content → built once (HTML + every image size on disk), served in ~2 ms.
export const prerender = true;
export const getStaticPaths = () => localeStaticPaths();

const lang = Astro.locals.lang;
const copy = getDictionary(lang).pricing;
---

<PageLayout
  seo={{ title: copy.meta.title, description: copy.meta.description }}
  breadcrumbs={[{ name: copy.meta.title, path: localizePath("/pricing", lang) }]}
>
  <Pricing {...copy.plans} />
  <Faq {...copy.faq} />
</PageLayout>
```

The page is now live at `/el/pricing` and `/en/pricing`, in the sitemap, with
canonical + hreflang tags and a BreadcrumbList. Nothing else to register.

### 2. Add the copy

**File:** `src/i18n/locales/el/pricing.json` (and the same file in every other locale)

```json
{
  "meta": { "title": "Τιμές", "description": "Διαφανής τιμολόγηση." },
  "plans": {
    "title": "Πακέτα",
    "items": [{ "name": "Basic", "price": "€49", "features": ["…"] }]
  }
}
```

Register it in `src/i18n/locales/el/index.ts`. **A key missing from a locale is a
type error** — that's the point.

### 3. Link it

**File:** `src/config/navigation.ts`

```typescript
export const mainNav: NavLink[] = [
  { label: "nav.home", path: "/" },
  { label: "nav.pricing", path: "/pricing" },   // label = translation key
];
```

Paths are locale-less; the components localize them. Add `nav.pricing` to every
`nav.json`.

## 🧩 Modules

Optional features live in `src/modules/<name>/` and are switched in one file:

**File:** `modules.config.ts`

```typescript
export default defineModulesConfig({
  modules: {
    blog: true,       // ← this is the whole installation step
    bookings: false,
    catalog: false,
    leads: true,
    media: true,
    settings: false,
  },
  options: {
    blog: { postsPerPage: 9, latestOnHome: 3 },
    catalog: { basePath: "products", currency: "EUR", showPrices: true },
    leads: { notifyEmails: ["sales@client.gr"] },
  },
});
```

| Module | Adds |
|---|---|
| `leads` | Contact/waitlist forms, spam protection, email notifications, admin inbox, CSV export |
| `media` | Image uploads, automatic AVIF/WebP versions, picker for the other modules |
| `blog` | Posts per language linked as translations, Markdown editor, categories, RSS |
| `catalog` | Products/services with prices, gallery, categories (`basePath` sets the URL) |
| `bookings` | Appointment requests with rules, admin workflow, customer emails |
| `settings` | Announcement bar, socials, notification emails — editable without a redeploy |
| `example` | Reference module showing every extension point (keep off) |

A module that is **off contributes nothing**: no routes, no admin pages, no actions,
no JavaScript in the bundle. The admin area itself exists only when an enabled module
needs it. Options are only read for enabled modules, so you can leave them filled in.

```bash
npm run module:list                       # what exists, what's on, what it needs
npm run module:new -- case-studies        # scaffold a new one (page + admin + table)
npm run module:remove -- bookings         # delete the folder
npm run module:add -- bookings            # bring it back from the template remote
```

Core never imports a module — pages expose `<ModuleSlot name="home.afterHero" />`
and modules fill it. Read [`src/modules/README.md`](src/modules/README.md) before
writing one.

## 🎨 Components & Theming

### Sections (full-width page blocks)

`HeroCentered` · `HeroSplit` · `FeatureGrid` · `Bento` · `Steps` · `Stats` ·
`Pricing` · `Testimonials` · `Faq` · `Gallery` · `Timeline` · `Team` ·
`LogoCloud` · `ContactSection` · `Cta` · `LegalPage`

### UI primitives

`Button` · `Card` · `Badge` · `Input` · `Select` · `Textarea` · `Field` ·
`Section` · `Container` · `SectionHeading` · `Img` · `Prose` · `Icon`

Run `npm run dev` and open **`/dev/ui-kit`** to see all of them with their variants.

### Theming

**File:** `src/styles/theme.css` — change the tokens, the whole site follows.

```css
@theme {
  --color-primary: oklch(0.55 0.2 265);
  --color-accent: oklch(0.75 0.15 190);
  --radius-md: 0.625rem;
}
```

Components only use semantic tokens (`bg-primary`, `text-muted-foreground`,
`rounded-md`) — **never raw colours** — so re-branding stays a one-file change.
Drop the client logo in `public/favicon.svg` and run `npm run brand:assets` for
favicons, app icons and the OG image.

## 📝 Forms

Forms use Astro Actions with `accept: "form"`, so they **work without JavaScript**;
the client script only adds inline errors and conversion tracking.

**Always build schemas with `src/lib/form-schema.ts`:**

```typescript
import { defineAction } from "astro:actions";
import { z } from "astro:schema";
import { formCheckbox, formRequiredText, formText } from "@/lib/form-schema";

export const submitQuote = defineAction({
  accept: "form",
  input: z.object({
    name: formRequiredText(80),        // empty → validation error
    phone: formText(30),               // empty → "" (not null)
    consent: formCheckbox(),           // absent → false
  }),
  handler: async (input, context) => { /* … */ },
});
```

> **Why:** Astro turns empty form fields into `null`, so a plain
> `z.string().default("")` **rejects empty input**, and any checkbox that is present
> counts as checked. These helpers are the fix.

Public pages are prerendered and cannot receive POSTs — post to a module route or an
endpoint, then redirect. Error messages are translation keys.

## 🌍 i18n

```typescript
const t = useTranslations(lang);          // UI strings, typed keys
t("nav.contact");

const dict = getDictionary(lang);         // structured page copy
dict.home.hero.title;

localizePath("/about", lang);             // → /el/about
pickLocalized(post.title, lang);          // per-locale DB columns
```

URLs are always prefixed (`/el/…`, `/en/…`). `Astro.locals.lang` is set by the
middleware — never parse the URL yourself. Adding or removing a language is a
`site.config.ts` change (or an answer to `npm run setup`).

## ⚙️ Configuration

**File:** `site.config.ts` — everything client-specific that isn't copy:

```typescript
export const siteConfig: SiteConfig = {
  name: "Acme",
  url: "https://example.com",
  defaultLocale: "el",
  description: { el: "…", en: "…" },
  themeColor: "#0f172a",
  organization: { legalName: "Acme Ltd", type: "Organization", logo: "/logo.svg" },
  contact: { email: "hello@example.com", phone: "+30 210 000 0000" },
  tracking: { ga4Id: "G-XXXXXXX", googleAdsId: "AW-XXXXXXX", conversions: { lead: "…" } },
  consent: { enabled: true },
};
```

**File:** `.env` (copy `.env.example`)

```env
SITE_URL=http://localhost:3000
DATABASE_URL=file:./data/app.db
UPLOADS_DIR=./data/uploads
RESEND_API_KEY=            # emails
EMAIL_FROM=
NOINDEX=false              # true on staging
```

With `consent.enabled`, nothing tracking-related loads until the visitor agrees
(Consent Mode v2; "Reject all" is as prominent as "Accept all"). Fire conversions
with `trackConversion("lead")` or a `data-track-conversion` attribute.

## 🔧 Commands

```bash
npm run setup          # configure a fresh clone for a new client
npm run dev            # dev server
npm run check          # astro check — types + templates. THE correctness gate
npm run build          # production build
npm start              # run the production build locally

npm run db:generate    # migration after editing a db/schema.ts
npm run db:studio      # browse the database
npm run admin:create -- --email you@client.gr --name "Your Name"

npm run module:list    # modules: on/off, dependencies, tables
npm run brand:assets   # favicons + OG image from public/favicon.svg
npm run demo:images    # regenerate the placeholder images
```

## 🎯 Best Practices

**Performance is the reason this template exists — these aren't style preferences:**

- **Content pages are prerendered** (`prerender = true` + `localeStaticPaths()`).
  Never switch a page to on-demand rendering just to read the database — use a
  server island (`<Component server:defer />`) for that part.
- **JavaScript is opt-in.** A marketing page ships ~1 KB. React is for admin islands
  only; effects are CSS-first and respect `prefers-reduced-motion`.
- **Tokens, not raw colours.** `bg-primary`, never `bg-[#0f172a]`.
- **Every string in every locale file** — a missing key fails the type check.
- **One `<h1>` per page**, images with width/height, hero image `priority`.
- **`npm run check` after every change**, `npm run build` when you touch rendering,
  modules or the server. For visible changes, look at the page at 375px width.

More detail per area: [`CLAUDE.md`](CLAUDE.md) (architecture),
[`src/modules/README.md`](src/modules/README.md) (module system),
[`docs/PLAN.md`](docs/PLAN.md) (why things are the way they are).
