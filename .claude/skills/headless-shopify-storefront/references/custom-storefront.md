# Building a storefront yourself

**Only for projects that are not a landing-template.** If `src/modules/shopify`
exists, none of this applies - that module already implements every pattern
below, and re-implementing them is how a project loses a week.

Steps 0-4 of the playbook are unchanged: the human setup, the Admin token, the
catalogue import and the verification all work the same. The scripts do too -
copy `scripts/shopify/` out of a landing-template checkout and change the
variable names in `env.mjs` to whatever the project uses (`NEXT_PUBLIC_*`, a
different env file, and so on). Only the rendering layer below is different.

The test for every pattern here: **can you add a new filter without touching a
component?**

---

## The facet manifest

The server builds a description of the available filters; the UI renders
whatever is in it and branches only on `kind`.

```js
{ id: 'color', label: 'Χρώμα', kind: 'swatch',
  options: [{ value: 'grey', label: 'Γκρι', hex: '#8A8D8F', count: 19 }] }
```

Behind it, a declarative source table. Adding a facet is one entry here:

```js
export const FACET_SOURCES = [
  { id: 'color', label: 'Χρώμα', kind: 'swatch',
    values: (p) => p.colors.map((c) => ({ value: c.handle, label: c.label, hex: c.hex })) },
  { id: 'material', label: 'Material', kind: 'chip',
    values: (p) => p.materials.map((m) => ({ value: m.handle, label: m.label })) },
];
```

Two behaviours worth building in:

- **Drop single-option groups.** A filter with one choice filters nothing and
  reads as clutter.
- **Ignore unknown group ids** when matching. Stale links then degrade to
  showing everything rather than nothing.

Filter semantics customers expect: **OR within a group, AND across groups.**
Grey-or-black, and leather. Assert both directions in tests — the two-value case
is where a naive implementation is wrong.

## Filter state in the URL

`?category=sofas&color=grey,brown&price=0-1500&stock=1`

Shareable, back-button-correct, and it deletes a pile of `useState` plus the
effect that syncs them. Reserve the non-facet keys (`category`, `price`, `stock`,
`q`, `sort`) and treat every other key as a facet group id — that is what keeps
the hook generic as facets are added.

Use `router.replace(..., { scroll: false })` so filtering does not jump the page
or flood history.

## One sidebar, not two

Desktop rail and mobile drawer must render the same component. Two copies drift:
a facet gets added to one and not the other, and nobody notices until a customer
cannot filter on a phone.

## Contrast

Check the contrast of any active-state colour before using it for small text.
A mid-tone brand accent with white text is commonly around 3.4:1, which fails
WCAG AA for body text. A tinted background with dark text plus a ring reads as
the same brand colour and passes comfortably.

Compute rather than eyeball — it is a few lines of luminance maths, and "looks
fine" is not a measurement.

## Descriptions

Storefronts built on mock data almost always render `description` (plain text)
rather than `descriptionHtml`, silently dropping every list, heading and image.

Sanitise on the way out even if the ETL sanitised on the way in — the Shopify
body editor is an editable surface and someone will paste into it.

Body images cannot use `next/image` (no known dimensions). A plain
`<img loading="lazy">` with CSS constraints is correct; do not fake dimensions.

## Ratings and reviews

Aggregate ratings from real reviews only. A product with no reviews keeps
`rating: 0` and the UI hides its stars. Never render a default rating —
five grey stars on every card is a lie with a nice hover state.

Hide the whole reviews section when there are none. An empty state that says
"no reviews yet" is honest; three placeholder testimonials are not.

## Persisted state across schema changes

Anything in `localStorage` outlives your refactor. A cart saved under an old
product shape will crash whatever reads the new one.

Version the key and validate on hydrate:

```js
const CART_KEY = "cart_items_v2";
function isUsable(item) { /* shape check */ }
```

Discarding an incompatible cart is usually right, not just convenient — if its
lines have no valid variant ID they could never check out anyway.

## Caching

If the aggregated catalogue payload is cached under a tag, something must purge
that tag. A webhook route that purges `products` and `collections` does not
purge `catalog`, and the stale payload can outlive everything.

Add a manual refresh path for the case where no webhook fires, such as a direct
catalogue push. Gate or remove it before launch — an unauthenticated endpoint
that forces a full upstream refetch is a free way to burn API limits.

## Deleting mock data

Hard-coded taxonomy that still compiles will outlive the migration. Grep for the
invented product names afterwards:

```bash
grep -rn "Bellagio\|CATEGORIES_TREE\|hashHue" app components lib
```

Watch for invented data hiding in helpers. A `hashHue()` that derives a swatch
colour from a string hash produces a plausible pastel for every product and is
entirely fictional.

## Next.js specifics

- `searchParams` in a page is a `Promise` in Next 16; await it.
- `images.qualities` is required in Next 16.
- Use the object form of `remotePatterns` and omit `search`, or every Shopify
  CDN URL is rejected. See `api-gotchas.md`.
- `revalidateTag(tag, { expire: 0 })` takes two arguments in Next 16.
- Reading `localStorage` in an effect is correct for SSR even when the lint rule
  objects; a lazy initialiser causes a hydration mismatch. Suppress with the
  reason written at the call site.

## Next.js traps (moved from api-gotchas.md)

### "hostname cdn.shopify.com is not configured under images"
Configured, but with the `new URL()` shorthand:

```ts
remotePatterns: [new URL("https://cdn.shopify.com/**")]   // rejects every Shopify url
```

The shorthand pins `search` to the URL's empty query string, and the docs state
the src "must not have a query string". Shopify CDN URLs always carry
`?v=<version>`. Use the object form and omit `search`:

```ts
remotePatterns: [{ protocol: "https", hostname: "cdn.shopify.com", pathname: "/**" }]
```

`images.qualities` is also required in Next 16.

### Cached catalogue never updates
A tagged cache is only as good as whatever purges the tag. If the aggregated
payload is cached under `catalog`, the webhook route must purge `catalog` — not
just `products` and `collections`. Add a manual refresh path too, for the case
where no webhook fires, such as a direct catalogue push.

`revalidateTag` takes two arguments in Next 16: `revalidateTag(tag, { expire: 0 })`.
