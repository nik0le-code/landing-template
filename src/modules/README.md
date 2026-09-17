# Modules

Optional features (blog, leads, bookings, …) that a site can switch on or off.

## Turning modules on and off

`modules.config.ts` at the project root is the **only** switch — one boolean per
module:

```ts
export default defineModulesConfig({
  modules: {
    leads: true,
    blog: true,
    bookings: false,
  },
  options: {
    leads: { notifyEmails: ["sales@client.gr"] },
  },
});
```

That's the whole change. No other step is needed:

- `npm run dev` restarts by itself when the file is saved.
- Database tables for **every** module folder are part of the migrations (and are
  applied automatically on the first request), so enabling a module needs no
  database command and disabling one never drops its data.

A module set to `false` contributes **nothing** to the build: no routes, actions,
admin pages or client JavaScript. This is structural, not a runtime check — the
integration (`src/integrations/modules.ts`) generates `src/modules/.generated/`
with static imports of enabled modules only, so the bundler never sees the rest.

The build warns about module folders missing from `modules` (they count as
disabled), so the config always shows everything available.

`options` are typed per module (see each module's `options.ts`) and ignored while
the module is off.

### Database migrations

Only needed when a schema **file** changes or a new module **folder** is added:

```bash
npm run db:generate   # writes drizzle/NNNN_*.sql — commit it
```

## CLI

```bash
npm run module:list                        # what exists, what's on, deps, tables, routes
npm run module:new -- case-studies         # scaffold a working module and enable it
npm run module:new -- faq --no-admin --base-path questions
npm run module:remove -- bookings --force  # delete the folder + unregister
npm run module:add -- bookings --from ../landing-template
```

`module:new` scaffolds a content module (table, admin list/edit, public list/detail,
i18n, options, sitemap) that works as soon as you run `npm run db:generate`.

`module:add` without `--from` restores the folder from a git remote that tracks the
template (`git remote add template <url>`; override with `TEMPLATE_REMOTE` / `TEMPLATE_REF`).

To keep a module's data, set it to `false` instead of removing it: `module:remove`
deletes the folder, and the next `npm run db:generate` then drops its tables. If
drizzle-kit asks whether a table was renamed, always choose create/drop.

## Anatomy

```
src/modules/<name>/
├── module.json      manifest: name, description, dependsOn, routes   (required)
├── index.ts         defineModuleRuntime: slots, sitemap, adminNav, i18n (required)
├── options.ts       option types (declaration merging) + defaults
├── actions.ts       `export const actions = {…}` → actions.<name>.<action>
├── db/schema.ts     Drizzle tables, prefixed `<name>_`, imports from drizzle-orm only
├── pages/           route entrypoints referenced in module.json
└── components/      UI, including components registered into slots
```

`src/modules/example` is a working reference for every extension point. It stays
disabled; copy it when writing a new module.

## Extension points

| Need | How |
|---|---|
| New public or admin page | Add to `routes` in module.json (`/[lang]/…` for localized pages); `{option}` placeholders take values from options, with defaults in `optionDefaults` |
| Form handling / mutations | `actions.ts` (Astro Actions; forms work without JavaScript) |
| Show UI inside core pages | `slots` in index.ts, rendered by `<ModuleSlot name="…">` |
| Dynamic URLs in sitemap.xml | `sitemap()` in index.ts |
| Extra CSP sources (CDN images, embeds) | `"csp": { "img-src": ["https://…"] }` in module.json, merged into astro.config.ts while enabled |
| Implement a service another module consumes | Consumer declares it in `ModuleServices` (declaration merging, like options); provider sets `provides: { name: () => import(...) }` and `dependsOn` the consumer. See `commerce` + `shopify`/`woocommerce` |
| Admin sidebar entry | `adminNav` in index.ts |
| Public menu link (navbar + footer) | `publicNav` in index.ts |
| Fresh data after a write | `Astro.cache.set({ tags: ["<name>"] })` on pages, `context.cache.invalidate({ tags: ["<name>"] })` in actions |
| Options per site | `options.ts` + `getModuleOptions("<name>", defaults)` |
| Admin-editable values on static pages | Render the component with `server:defer` (server island) and read `getSiteSettings()` |

Core slots: `contact.form`, `home.afterHero`, `home.beforeCta`, `layout.beforeFooter`,
`header.actions` (navbar, next to the menu button), `admin.dashboard`. Slots on prerendered pages render at build time — for data that
changes (latest posts), render the slot component with `server:defer`.
Add new ones by placing `<ModuleSlot name="…" />` in a core page and extending
`SlotName` in `types.ts`.

## Rules

- Form actions (`accept: "form"`): use the helpers in `src/lib/form-schema.ts`
  (`formText`, `formRequiredText`, `formUrl`, `formLink`, `formCheckbox`) for every
  text/checkbox field. Astro turns empty fields into `null` unless the outermost
  schema is `.optional()`, so `z.string().default("")` rejects an empty input, and
  it treats any present checkbox field as checked.

- Core code never imports from a module folder. Modules may import core code.
- A module may import another module only if it lists it in `dependsOn`.
- `module.json`, `db/schema.ts` and `options.ts` must stay loadable without Vite:
  no `@/` imports in `db/schema.ts`.
