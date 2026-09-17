# Data modelling

How to represent catalogue attributes in Shopify so the storefront can filter on
them.

## Variant options vs metafields

The distinction that matters: **a variant option is something the customer
chooses at purchase; a metafield is a property of the product.**

Colour is usually an option — you buy the grey one. Frame material is usually a
metafield — the product is oak, you cannot pick pine. Getting this wrong forces
fake variants, or loses the ability to add to cart with a real selection.

Facets can read from either. Filtering needs the metafield; buying needs the
option. Products with colour variants want both, which is why the colour
metafield holds the **union** of its variants' colours.

## Grouping rows into variants

Feeds usually arrive one row per purchasable thing. Deciding which rows collapse
into one product is the highest-leverage decision in the import.

Grouping **by colour only**, one product per size, works well because:

- price stays uniform within a product, so cards show one price not a range
- the colour option is a genuine choice, size usually is not
- it matches how furniture and apparel shops actually list

**Verify before committing:** for every proposed group, check that all rows
share a price and that option labels are unique within the group. If prices vary
inside a group, the grouping is wrong.

Deriving the base name by stripping the colour clause from the title is usually
enough. Watch for:

- **Homoglyphs** splitting a group in two
- **Multi-colour products** (`Walnut / Black` frame + cushion) — join with a
  separator for the option label; the metafield still gets both families
- **Near-identical model names** (`JULIA` vs `JULIA Massage`) that must stay
  separate

## Normalised families vs raw values

Raw vendor values make bad filters: 19 colour spellings produce chips matching
one product each. Normalise to ~10 families.

Keep both roles distinct:

- **Family** (`grey`) drives the filter chip
- **Vendor wording** (`Antique Grey`) is the variant option label the customer sees

Longest-match-first matters when matching vocabulary against text: `Antique Grey`
must be tried before `Grey`, `Rope Wicker` before `Wicker`. Blank out matched
tokens so a longer token's substring cannot match again.

## Metafields vs metaobjects

| | Metafield (text) | Metaobject reference |
|---|---|---|
| Setup | one definition | definition + entries + GID wiring |
| Extra data | no | yes — hex, image, sort order |
| Client-editable | value only | label, hex, everything, in Admin |
| Good for | simple enums | anything with presentation data |

Colour wants a metaobject because swatches need hex, and the client retuning a
swatch should not need a deploy. Plain text is right for a value with no
presentation payload.

Shopify's standard `shopify--color-pattern` metaobject exists, but writing to it
requires taxonomy GID references. Use it only if you want Shopify's native theme
filtering; a custom definition is simpler for a headless storefront.

**Every definition needs `access: { storefront: 'PUBLIC_READ' }`.** Without it
the Storefront API returns `null` and the filter UI comes up empty while the
Admin looks perfect.

## A workable metafield set

```
custom.color            list.metaobject_reference → color_swatch
custom.material         list.metaobject_reference → material
custom.space            single_line_text_field      indoor | outdoor
custom.seats            number_integer
custom.made_to_order    boolean
custom.frame            single_line_text_field
custom.dimensions_text  single_line_text_field
custom.source_vendor    single_line_text_field
```

`source_vendor` as a metafield rather than Shopify's `vendor` field keeps a
display label independent of the internal identity.

## Turning a metafield into a filter (landing-template)

The module's sidebar renders whatever the Storefront API returns in
`filters[].values[]`, including swatches. It does not read your metafield
definitions, and there is no facet table in code to edit.

Shopify decides that list, and a **merchant configures it in the Search &
Discovery app** (free, from the Shopify App Store): Apps -> Search & Discovery ->
**Filters** -> Add filter -> pick the metafield. Until someone does that, a
perfectly modelled metafield produces no filter chip.

Consequences worth planning around:

- The metafield definition needs `access: { storefront: "PUBLIC_READ" }` or it is
  invisible to the Storefront API in the first place.
- Filters only come back on **collection and search** queries, never on the bare
  product list. Landing shoppers on a collection is a design decision, not a
  detail.
- It is a human step. Put it in the handover, or the client's new "Material"
  metafield silently never appears.

## Products with no value for a facet

Made-to-order goods have no colour. Two options:

- **Leave empty** — clean, but those products vanish whenever anyone touches the
  colour filter, which can be a fifth of the catalogue.
- **Explicit value** (`Made to order`) — they stay visible under their own chip.
  Render it as a gradient swatch rather than inventing a colour.

The second is usually right. Vanishing products look like a bug.

## Collection trees

Shopify collections are flat. For two levels:

```
custom.parent   single_line_text_field   parent handle, empty for roots
custom.sort     number_integer           display order
```

Assign each product to both its leaf and its root, so a root collection query
returns the whole subtree.

Cross-cutting collections (`sale`, `new`) are computed from product state rather
than taxonomy, and sit alongside the tree as roots with no children.

Emit only non-empty collections. An empty category in the nav is worse than a
missing one.

## Tags

Scraped tags are almost always junk — other products' model names, marketing
slogans. Discard them and derive a small set you control:

```
new  sale  bestseller  in-stock  indoor  outdoor  <vendor-slug>
```

Enforce the allow-list in the validator so a stray tag fails the build instead
of reaching the storefront.

## Reviews

Shopify's core API has no reviews primitive. Either a reviews app owns them
(Judge.me, Loox, Okendo) or you model them yourself:

```
customer_review metaobject
  author *   rating 1-5 *   body *   product →   location   published_at
```

Note `product_review` is a reserved type name.

Aggregate product ratings from linked reviews. A product with no reviews keeps
rating 0 and the UI hides its stars — **never seed placeholder reviews.**
Inventing them breaches EU consumer-protection rules, and the empty state is
easy to render honestly.
