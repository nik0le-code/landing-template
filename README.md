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

## ✍️ What You Edit By Hand

`npm run setup` handles the mechanical parts (config, languages, modules, brand
colour, admin user, git remotes). Everything below is the work it can't do for you,
in the order it's worth doing. A typical client site is these eight files.

**1. `src/i18n/locales/{el,en}/*.json` — all page copy.** The biggest job by far.
One file per page (`home.json`, `about.json`, `services.json`, `contact.json`), plus
`nav.json`, `footer.json`, `common.json`, `consent.json`, `legal.json`. Write the
client's real copy here, not in the `.astro` files. **A key missing from one locale
is a type error**, so both languages stay in sync by construction.

**2. `src/config/navigation.ts` — menu, dropdowns, footer columns.** Labels are
translation keys (`nav.about`), paths are locale-less (`/about`); the components
localize them. Add a key to every `nav.json` when you add a link.

**3. `public/favicon.svg` — the client's logo,** then `npm run brand:assets` to
regenerate the favicons, app icons and the OG image from it. If the logo is coloured
rather than monochrome, drop the `logo-mark` class in
`src/components/layout/Logo.astro` (it inverts monochrome marks in dark mode).

**4. `src/styles/theme.css` — brand tokens.** `npm run setup` sets the accent for
you; adjust `--foreground` / `--background` / `--accent` here if the brand needs
more than that. Both light and dark values live in this one file.

**5. `src/assets/demo/*.jpg` — photography.** Replace with the client's real photos,
keeping the file names (or update the imports in `src/pages/[lang]/*.astro`).
`npm run demo:images` refills them with neutral placeholders in the meantime.

**6. `src/content/legal/{el,en}/privacy.md` and `terms.md`.** Markdown with
`title` / `description` / `updatedAt` frontmatter. The shipped text is a placeholder
and says so: **replace it with what the client's lawyer approved.**

**7. `site.config.ts` — the details the wizard didn't ask for:** postal address,
opening hours, `socials`, `organization.type` (use a LocalBusiness subtype like
`"Dentist"` or `"Restaurant"` when it applies — it feeds the JSON-LD), and
`tracking.ga4Id` / `googleAdsId` / `conversions` once the client sends their ids.

**8. `.env`** (copy `.env.example`): `SITE_URL` for production, plus `RESEND_API_KEY`
and `EMAIL_FROM` if a module sends email. `NOINDEX=true` on staging.

Then, as the site needs them:

- **New pages** → `src/pages/[lang]/<name>.astro` (see [Adding a Page](#-adding-a-page)).
- **Features** → flip a boolean in `modules.config.ts` (blog, leads, bookings, …).
- **Section order per page** → the `.astro` page files; the sections themselves take
  copy as props, so reordering is moving lines.

**What you should not need to touch:** `src/components/ui/`, `src/components/sections/`,
`src/layouts/`, `src/lib/`, `astro.config.ts`, `server.mjs`. If a client needs a
section that doesn't exist, add it to `src/components/sections/` rather than
hand-rolling markup in a page.

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
| `wordpress` | WordPress as the backend: posts and pages from wp-admin in the site's design (Polylang, SEO, cache purge on publish), WordPress plugins listed in config (`npm run wp:up`, `wp:plugins`), and the WooCommerce shop with `shop: true` (checkout here: cash on delivery, bank transfer, Viva.com, Piraeus ePay) |
| `strapi` | Strapi as the backend instead of WordPress: posts, categories and pages written in Strapi in the site's design, the site's own pages editable (localized, SEO, cache purge on publish), a lean local Strapi in Docker (`npm run strapi:up`) |
| `shopify` | Headless Shopify shop: storefront, filters, cart drawer, Shopify's hosted checkout |
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

### Effects (`src/components/effects/`)

| Component | What it does | JS |
|---|---|---|
| `Reveal` | Fade/slide/zoom/blur/flip in on scroll, with stagger | none |
| `Parallax` | Content drifts as it crosses the viewport | none |
| `ScrollProgress` | Reading-progress bar (already on legal pages) | none |
| `CountUp` | Numbers count up when scrolled into view | none |
| `Marquee` | Infinite scroller, pauses on hover | none |
| `Aurora` | Drifting colour blobs behind a section | none |
| `Meteors` | Shooting stars, randomised at build time | none |
| `PerspectiveGrid` | 3D horizon grid for dark sections | none |
| `GlowBackground` / `GridBackground` | Static glow and grid patterns | none |
| `OrbitingCircles` | Logos orbiting a centre mark | none |
| `FlipCard` | Two-sided card, flips in 3D on hover/focus | none |
| `ShineBorder` | Animated gradient border (featured plan) | none |
| `LampLight` | Glowing divider that widens on scroll | none |
| `Typewriter` | Types one phrase, with caret | none |
| `Shine` | Light sweep across a CTA on hover | none |
| `Tilt` | 3D tilt towards the pointer, optional glare | ~0.4 KB |
| `Spotlight` | Light follows the pointer inside a card | ~0.4 KB |

Scroll-linked motion uses **CSS scroll-driven animations** (`animation-timeline`) —
no scroll listeners, no IntersectionObserver, nothing to hydrate. Tilt and Spotlight
share one tiny pointer script and are skipped entirely on touch devices. Everything
is disabled under `prefers-reduced-motion`, and nothing animates layout, so there is
no CLS. Hero copy rises into place without fading, because fading the headline in
would delay LCP.

Several sections turn effects on by default and take a prop to turn them off:
`<FeatureGrid spotlight={false}>`, `<HeroSplit tilt={false} intro={false}>`,
`<Stats countUp={false}>`, `<Cta aurora={false}>`, `<HeroCentered background="aurora">`.

Run `npm run dev` and open **`/dev/ui-kit`** — every primitive and effect, live, with
a copy button for each snippet and a phone/tablet width switcher.

### Theming

**File:** `src/styles/theme.css` — change the tokens, the whole site follows.

```css
:root {
  --foreground: oklch(0.22 0.011 80);   /* ink */
  --background: oklch(0.985 0.003 80);  /* paper */
  --primary: oklch(0.255 0.012 80);     /* buttons: ink, not a colour */
  --accent: oklch(0.53 0.135 45);       /* the one real colour */
}
```

**The look is ink on paper**, and that is a deliberate reaction to how generated
landing pages look. The rules the components follow:

- **Primary is ink**, not a brand colour. Buttons and headlines carry weight through
  contrast. `--accent` is the single real colour and appears only in small doses:
  a rule, the active nav item, an icon.
- **No glow, no gradient mesh, no glass.** Aurora, spotlight, shine and tilt still
  exist in `src/components/effects/`, but nothing uses them by default. Turn one on
  per client if it fits the brand.
- **Hairlines over shadows.** Cards are a 1px border on a flat surface; shadows are
  reserved for things that genuinely float.
- **Squared off.** 4-6px radii, no pills.
- **Labels are set in mono** (`class="label"`) instead of a coloured chip.
- **Real photography.** `npm run demo:images` pulls neutral placeholder photos;
  generated gradient blobs are the loudest tell that nobody art-directed the page.

Components only use semantic tokens (`bg-primary`, `text-muted-foreground`,
`rounded-md`), **never raw colours**, so re-branding stays a one-file change.

### Dark mode

On by default (`darkMode: true` in `site.config.ts`). It follows the visitor's system
setting, and the navbar toggle overrides it, remembered in `localStorage`:

```
:root                     light values (the source of truth)
prefers-color-scheme:dark system dark, unless the visitor chose light
[data-theme="dark"|"light"] the visitor's explicit choice
```

Both modes are the **same token names** with different values, so components need no
`dark:` variants. Two tokens exist specifically to stop a dark page from flashing
white blocks halfway down:

- `bg-contrast` — inverted bands (dark stats strip, toasts). Stays dark in dark mode.
- `bg-brand-surface` — large brand-filled areas (CTA panel, announcement bar). In dark
  mode it becomes a deep brand tint instead of the bright accent.

Set `darkMode: false` for a brand that must always render light: the page is pinned to
light and the toggle disappears. Contrast was checked in both modes (WCAG AA, computed
against the real composited backgrounds).

House rules that keep a client site from looking generic:

- **One accent colour** for the whole page. No second accent in section seven.
- **One shape system:** interactive elements are pills (buttons, nav, badges),
  inputs are `rounded-md`, cards and panels `rounded-lg` / `rounded-xl`.
- **Shadows are tinted** with the brand hue (`--shadow-md`), never pure black.
- **Eyebrows are rationed:** at most one small uppercase label per three sections.
  A label above every heading is what makes a page read as templated. Pass
  `eyebrow={undefined}` on the sections that don't need one.
- **Vary the layout family.** Don't stack three card grids: `FeatureGrid` takes
  `align="left"`, `variant="plain"`, `columns` and `highlightFirst` (a double-width
  first cell, automatically ignored when it would leave a hole in the grid).
- **No em-dashes in copy.** They are the clearest tell of machine-written text.
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
