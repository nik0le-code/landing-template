# strapi

Strapi as the site's content backend, edited in Strapi's admin and shown with this
site's design. It is the alternative to [`wordpress`](../wordpress/README.md) for sites
that need content editing but no WooCommerce shop or WordPress plugins (the two can't be
enabled together).

- **Content:** posts (list, categories, post pages, RSS, latest posts on the home page)
  and pages, in every language (Strapi locales), with SEO, hreflang, sitemap entries,
  and the cache cleared the moment something is published.
- **The site's own pages:** texts, lists and images of the pages built in code (home,
  about, services, contact) are editable in Strapi; empty fields keep the code copy.
- **Lean:** Strapi runs in production mode (prebuilt admin, no file watchers) on
  SQLite in one container, about 200 MB of RAM idle. No database server, no
  users-permissions or cloud plugins, and the content API is private (read-only token).

```ts
// modules.config.ts
modules: { strapi: true, wordpress: false },
options: {
  strapi: {
    content: { posts: true, pages: true, sitePages: true },   // all false: nothing to show
    postsPath: "blog",                        // posts at /[lang]/blog (don't enable the blog module too)
    postsPerPage: 9,
    latestOnHome: 3,
    cacheSeconds: 300,
  },
},
```

## Quick start

```bash
npm run strapi:up             # Strapi in Docker, admin user, read-only token, .env written, site pages filled
npm run dev                   # restart it if it was running: .env changed
```

Editors open **`<site>/admin`** (here http://localhost:3000/admin), which redirects to
Strapi's admin at `/cms/admin`: Strapi lives under `/cms` on the site's own domain, so there
is no second hostname. Locally the site passes `/cms/*` to Strapi (`pages/cms.ts`); in
production the proxy in front does (Traefik in the k3s cluster). `/admin` only redirects
while the site has no admin area of its own (no module with `"admin": true`, e.g. leads);
with one, editors go to `/cms/admin` directly.

`strapi:up` is safe to run again; it only fills in what's missing. It:

1. writes the site pages' content types (`strapi:fields`, below),
2. builds and starts the container (`src/modules/strapi/strapi/compose.yml`); the first
   build takes a few minutes, later ones are cached,
3. creates the first admin, `admin@example.com` / `Admin1234`, on a fresh Strapi,
4. creates a read-only API token named "site" when `.env` has none that works,
5. sets `STRAPI_URL`, `STRAPI_TOKEN` and `STRAPI_WEBHOOK_SECRET` in `.env` (other keys stay),
6. fills the site pages with what the site shows (`strapi:sync`, below),
7. with `--demo`, adds two example posts and a category (nothing else on the site changes).

It warns when `strapi` is off in `modules.config.ts` (Strapi still starts) or when
`wordpress` is on too.

```bash
npm run strapi:fields         # after changing a page's copy or editable-pages.ts (restarts Strapi, fills new fields)
npm run strapi:sync           # fill empty site-page fields from the code copy (-- --force: overwrite all)
npm run strapi:token          # print a new read-only token for the site (replaces the old one)
npm run strapi -- routes:list # any Strapi CLI command, inside the container
npm run strapi:down           # stop (-- --volumes deletes the data and uploads)
```

Options: `--port 1338` (or `STRAPI_PORT`), `--site-url` for where change notifications go
(default `SITE_URL` or `http://localhost:3000`).

The dev server doesn't cache pages, so publishing shows up on reload (Strapi logs
"change notification failed" in dev: `astro dev` only listens on localhost, which the
container can't reach). To see cache invalidation locally, run the production build
(`npm run build && npm start`).

## Content model

Content types live in the repo (`strapi/src/api`, `strapi/src/components`), mounted into
the container. Strapi's Content-Type Builder is off in production mode: change a schema
file (or run `strapi:fields`) and restart. Every type is localized, with one locale per
site language (created on start; the site's default language is Strapi's default).

| Strapi | Site |
|---|---|
| Post `welcome` (English) | `/en/blog/welcome` |
| Category `news` | `/en/blog/category/news` |
| Page `team` | `/en/team` |
| Other locales of the same entry | hreflang alternates, language switcher, sitemap |
| Cover image | cover, Open Graph image (Strapi's renditions as srcset) |
| SEO component (title, description, image, noindex) | page SEO; empty fields use title, excerpt, cover |

- **Rich text** is Strapi's blocks editor, rendered from its JSON (`lib/blocks.ts`):
  paragraphs, headings (h2/h3 get ids and the post's table of contents), lists, quotes,
  code, images, links. Nothing editor-authored reaches the page as raw HTML.
- **Routing:** Strapi pages are the lowest-priority route. Pages in `src/pages/` and
  module routes always win; a Strapi page only answers paths nothing else owns. Pages
  are one level deep (`/[lang]/<slug>`).
- **Drafts:** posts and pages have draft & publish; only published entries appear.
  Site pages are live on save.
- **Uploads:** images and PDFs (SVG is refused). Renditions at 600, 1000 and 1600 px.
- **Menus** stay in `src/config/navigation.ts`; the posts link is added automatically.

## The site's own pages (`content.sitePages`)

Each page in `src/config/editable-pages.ts` gets a single type, "Site page: Home",
"Site page: About"… (Content Manager → Single Types), generated from the page's copy
(`src/i18n/locales/<default>/<page>.json`):

- **Texts:** every string, one component per section; the code text is the placeholder
  and the description, so editors see what an empty field shows.
- **Lists:** FAQ items, features, team members, plans… as repeatable components.
- **Images:** the slots declared in `editable-pages.ts`, from the media library. A slot's
  `src` lists the file(s) the page shows by default; images a page picks per list item
  (by slug, by position) are named in `src/config/editable-images.ts`. Strapi uploads
  them (as does `strapi:sync`), so every slot shows the picture the page shows. A slot with `sameAs`
  (`{ page, path, by: "slug" }`) is one picture with another page's slot, item by item:
  Strapi copies an image chosen on either page to the other (same language), so a home
  grid and the page it previews stay in step whichever one the editor opens.

On every start Strapi fills every empty field, in every language, with the site's current
copy and uploads the page's default images (`src` in `editable-pages.ts`, `editable-images.ts`),
so it starts as an exact copy of the site; what editors entered stays (`strapi/src/index.js`).
It can't run the site's code, so `npm run strapi:seed` writes what to fill with into
`strapi/seed/` (not committed) and the image carries it: CI runs it before building the
image. Locally `strapi:up` fills the same way through `strapi:sync`.
From then on **Strapi is the source of truth** for those pages:
changing the JSON copy in code no longer shows on the site for fields Strapi has a value
for. Empty fields (new sections, a cleared field, a new language) are filled on the next
start, or by `strapi:sync`; `strapi:sync -- --force` overwrites everything with the code copy again.

A field cleared in Strapi shows the code copy; an edited list replaces the list, and empty
fields in an item fall back to the code item at the same position.

Default images are uploaded with the caption "The site's own image". In the slot it was
synced for, such an image is the page's own picture: the page keeps its optimized copy
with its framing (crop, plate), so syncing never changes how a page looks. Any other
image, including one of those files picked for a different slot, replaces it. Emptying
the field shows the site's own image too.

While this is on, those pages are server-rendered and cached (about 2 ms once cached,
cleared when a site page is saved) instead of prerendered. Turn it off and they are
prerendered again with the code copy.

**Adding a page or an image slot:** add the page to `editable-pages.ts`, read it in the
page with `const { copy, images } = await getPageContent(Astro, "<key>")`, then run
`npm run strapi:fields`. Changing the JSON copy (new keys, new sections) also needs it.
Generated files (`strapi/src/api/site-*`, `strapi/src/components/site-*`,
`strapi/src/site-pages.json`) are committed. Values already entered in Strapi stay as long
as the key names do. Keys Strapi reserves (`meta`, `status`, `locale`…) are stored as
`<key>Fields` and mapped back.

## Production

Strapi runs as its own service next to the site, from its own image. On the NOTIXV k3s
landings pipeline the chart runs it (`strapi: true` in the site file) and the build
workflow publishes `<repo>-cms` next to `<repo>`: see
[`docs/k3s-strapi.md`](../../../docs/k3s-strapi.md). Anywhere else:

```bash
npm run strapi:seed           # what Strapi fills empty site-page fields with, into its image
docker build -t client-strapi src/modules/strapi/strapi
npm run strapi:secrets        # prints APP_KEYS, salts, ENCRYPTION_KEY, the webhook secret
```

1. Run the image with the printed variables, `PUBLIC_URL=https://www.client.gr` (the
   site's origin; Strapi appends `/cms`), and two volumes: `/data` (SQLite database) and
   `/opt/app/public/uploads` (media). Back up both. One replica: SQLite is one file.
   It runs as uid 1000 with a read-only root filesystem; `/tmp` must be writable.
2. `HEADLESS_WEBHOOK_URL=https://www.client.gr/api/strapi/webhook` and
   `HEADLESS_WEBHOOK_SECRET` (same value as the site's `STRAPI_WEBHOOK_SECRET`). Several
   sites (development and production) are comma-separated URLs.
3. Route `<site>/cms/*` to Strapi with the `/cms` prefix stripped, except `/cms/api/*`
   (the content API stays internal). Then open `<site>/cms/admin`, create the first admin,
   and `npm run strapi:token -- --url …` (or Settings → API Tokens → a **read-only** token
   with unlimited duration). The site pages are already filled with the site's copy.
4. Site environment (runtime only, nothing at build time): `STRAPI_URL` (the address the
   site's server reaches Strapi at; an internal one is best), `STRAPI_TOKEN`,
   `STRAPI_WEBHOOK_SECRET`.
5. Content types and the copy Strapi fills empty fields with ship with the image: rebuild
   and redeploy it after `strapi:fields` or a copy change.

The admin bundle is built for `/cms` with relative URLs (one image works on every host)
and its session cookies are scoped to `/cms/admin`, so both are fixed at build time: serving
Strapi under another prefix means changing `CMS_PATH` in `config/server.js` and the cookie
path in `config/admin.js`, then rebuilding. Every Strapi response carries
`X-Robots-Tag: noindex`. Browsers load images from the site itself:
`/uploads/<file>` is streamed from Strapi by the site (`pages/uploads.ts`) with immutable
caching, so the CSP needs no CMS origin and Strapi's API can stay private.
`STRAPI_MEDIA_URL` is only for uploads served from elsewhere (an S3/CDN provider); set it
at build time too, for the CSP.

Memory: the image caps Node's heap at 384 MB (`NODE_OPTIONS`); the compose file limits the
container to 512 MB. It idles around 200 MB and stays under 250 MB while editing.

The page cache is in memory per site pod: with several replicas only the pod that
receives a notification is purged at once, the rest within `cacheSeconds`.

## AI assistants (Strapi's MCP server)

Strapi's built-in MCP server answers at `<site>/cms/mcp` (`mcp` in `config/server.js`;
`MCP_ENABLED=false` on Strapi turns it off). It exposes list, get, create, update, delete,
publish and unpublish tools for every content type, limited to the permissions of the token
it is called with.
It works on every host the site serves, through the same `/cms` route as the admin.

1. In `<site>/cms/admin`: **Settings → Admin Tokens → Create new Admin Token**. Its
   permissions are chosen there and can never exceed its creator's: give it only the
   Content Manager permissions for the content types the assistant should edit. Copy the
   token; Strapi shows it once.
2. Add the server to the assistant, with the token as a Bearer header:

   ```bash
   claude mcp add --transport http strapi https://www.client.gr/cms/mcp \
     --header "Authorization: Bearer <admin token>"
   ```

   Claude Desktop, Cursor and other clients take the same URL and
   `Authorization: Bearer <admin token>` header in their MCP settings.
3. Revoke or regenerate the token in **Settings → Admin Tokens** when it leaks or a person
   leaves.

Locally it is `http://localhost:1337/mcp` (or `http://localhost:3000/cms/mcp` through the
site) after `npm run strapi:up`.
