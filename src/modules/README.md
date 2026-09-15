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
| New public or admin page | Add to `routes` in module.json (`/[lang]/…` for localized pages) |
| Form handling / mutations | `actions.ts` (Astro Actions; forms work without JavaScript) |
| Show UI inside core pages | `slots` in index.ts, rendered by `<ModuleSlot name="…">` |
| Dynamic URLs in sitemap.xml | `sitemap()` in index.ts |
| Admin sidebar entry | `adminNav` in index.ts |
| Fresh data after a write | `Astro.cache.set({ tags: ["<name>"] })` on pages, `context.cache.invalidate({ tags: ["<name>"] })` in actions |
| Options per site | `options.ts` + `getModuleOptions("<name>", defaults)` |

Core slots: `contact.form`, `home.afterHero`, `home.beforeCta`, `layout.beforeFooter`.
Add new ones by placing `<ModuleSlot name="…" />` in a core page and extending
`SlotName` in `types.ts`.

## Rules

- Core code never imports from a module folder. Modules may import core code.
- A module may import another module only if it lists it in `dependsOn`.
- `module.json`, `db/schema.ts` and `options.ts` must stay loadable without Vite:
  no `@/` imports in `db/schema.ts`.
