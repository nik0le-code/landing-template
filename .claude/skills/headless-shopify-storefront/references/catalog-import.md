# Building the catalogue

Turning whatever the client has — a vendor feed, a spreadsheet, a scrape, a pile
of photos — into `data/catalog.json`, which `npm run shopify:push` writes into
Shopify.

This half needs no credentials, so it is what you do while the human is still
working through `human-setup.md`.

```
data/feeds/<source>.json            committed, reviewable inputs
scripts/shopify/import/vocab.mjs    normalisation tables: one source of truth
scripts/shopify/import/parse-name.mjs   attributes out of titles
scripts/shopify/import/describe.mjs     description normalisation
scripts/shopify/import/taxonomy.mjs     product → collection handles
scripts/shopify/import/<source>.mjs     one per source, same output shape
scripts/shopify/import/build.mjs        merge, validate, write data/catalog.json
```

One module per source, everything else shared. Adding a third supplier should
mean one new file, not edits scattered through the pipeline. The format and the
validator are already written, in `scripts/shopify/catalog.mjs` — import
`validateCatalog` from there rather than inventing a second contract.

Copy the feeds into `data/feeds/` rather than reading from `~/Downloads`. They
are the input to a reproducible build.

## Read the data before you plan anything

Report real numbers back to the user first. Counts, distinct values, which fields
are populated, which are junk. It surfaces the decisions only they can make, and
it gives you assertions to test against later.

"57 rows collapse to 41 products, 9 with colour variants, every group
price-uniform" is a contract you can verify. "products.json contains products" is
not.

Expect, in roughly this order of nastiness:

- **One concept spelled several ways.** `Antique Grey`, `Ανθρακί`, `Mixed Grey`,
  `Grey Brown` are all grey. Normalise for filtering, keep the vendor's exact
  wording for display.
- **Homoglyphs.** A Latin `K` inside a Greek word looks identical and silently
  splits one product into two. Scan for Latin letters adjacent to non-Latin ones
  before trusting any grouping.
- **Fields whose type varies by source.** One feed's `images[]` is URL strings,
  another's is `{huge, enlarge, normal, thumb}` objects. Validate types.
- **Marketing junk in tags.** Scraped tags are usually other products' model
  names. Discard them and derive a small tag set you control.
- **Outbound links in descriptions.** Vendor descriptions link back to the
  vendor's own shop. Strip anchors, keep the text, or you ship a competitor link
  on every product page.
- **Feed-level contradictions.** A product whose category path and category note
  disagree. Pick a precedence, document it, and list the affected products for
  the client instead of silently choosing.

## The decisions that change the shape

Ask, do not guess. They are in `human-setup.md` step 0; these two are the ones
that need the data in front of you:

**Variant grouping.** Do `Sofa 2-seat Brown` and `Sofa 3-seat Brown` become one
product with two options, or two products each with a colour option? Grouping by
colour only, one product per size, keeps price uniform inside a product, so cards
show one price instead of a range. **Verify price uniformity inside every
proposed group before recommending it** — that is the whole argument.

**How many facet values a shopper sees.** Around ten colour families filter well.
Nineteen raw spellings produce chips that each match one product. And products
with no real value for a facet — made-to-order furniture has no colour — need an
explicit value like "Made to order", or they vanish the moment anyone filters.

## Vocabulary

Keep normalisation tables in one module: families with display labels and
presentation data, plus raw-value-to-family maps.

```js
export const COLOR_FAMILIES = {
  grey: { label: "Γκρι", hex: "#8A8D8F", order: 2 },
  "made-to-order": { label: "Made to order", hex: null, order: 99 },
};
export const RAW_COLOR_TO_FAMILY = {
  "Γκρι": "grey", "Ανθρακί": "grey", "Antique Grey": "grey", "Mixed Grey": "grey",
};
```

Match longest-first so `Antique Grey` beats `Grey`.

## Extracting from titles

Vendor titles pack attributes in: `COSTA Chair Aluminium, Walnut Textilene Black`.

Match tokens longest-first and **blank out each match** so a longer token's
substring cannot match again — otherwise `Rope Wicker` also reports `Wicker`.

For the base name: split on commas, keep segments until one contains a colour,
then strip any trailing colour token. Variant grouping depends on this, so test
it against real titles, not invented ones.

## Descriptions

Normalise to one small tag vocabulary so the storefront has one thing to style:

```
p br strong em b i u ul ol li h3 h4 h5
table thead tbody tr th td img figure figcaption hr blockquote
```

Two shapes worth handling:

- **Structured HTML with cruft** — strip classes and unknown tags, keep content.
- **`<br>` soup** — split plain text on blank lines; a block whose first line
  ends in `:` is a heading with a list under it; short multi-line blocks are spec
  lists; everything else is a paragraph.

Descriptions go into `descriptionHtml`. The module renders that, not
`description`, so lists, headings and tables survive.

Collect `<img>` URLs separately. Rewriting them is a push-time concern, because
some of them need rehosting (below).

## Images

`push.mjs` hands Shopify a URL and Shopify fetches it. That fails when the source
blocks Shopify's fetcher — `fileStatus: FAILED`, "Unsuccessful HTTP response
code: 403" — which some vendor CDNs do on purpose.

For those, download the file yourself and upload it through `stagedUploadsCreate`
+ `fileCreate`, then substitute the resulting CDN URL. Cache the original-to-CDN
map on disk: a few hundred uploads take minutes and you will restart.

`productSet` takes the first 20 images per call, and re-sends the whole media set
on every run. Use `--skip-images` when re-pushing text-only changes.

## The validator is the point

`validateCatalog()` in `scripts/shopify/catalog.mjs` already rejects malformed or
duplicate handles, duplicate SKUs, non-https images, compare-at prices that do not
exceed the price, undeclared option values, duplicate option combinations,
oversized variant and image counts, and list-typed metafields that are not
JSON-encoded.

**Add a rule every time a trap catches you.** Project-specific rules — an
allow-list of tags, known collection handles, known colour families — go in the
project's own `build.mjs` and run alongside it. That is what stops the same bug
returning with the next supplier.

## Testing

`node --test` needs no dependencies:

```json
"test": "node --test scripts/shopify/import/*.test.mjs"
```

Assert **exact counts derived from the real feeds** — product count, variant
count, per-collection counts, how many products have more than one variant. Those
catch silent regressions a shape-only test cannot.

When a test fails, check which side is wrong. An expectation written from a guess
is worth less than the implementation; if the implementation is right, fix the
test and say so.

## The CSV shortcut, and its ceiling

Shopify's **Products → Import** accepts a CSV, which the client can also use
themselves. It is a fair choice for a small hand-maintained catalogue.

What it cannot do, and why most catalogues come back here:

- **One collection per product.** Extra grouping has to go in tags.
- **No metafields**, so no filterable specs and no metaobject swatches.
- **Not idempotent in a useful way** — "overwrite products with the same handle"
  is all-or-nothing.
- Images are fetched from the URLs in the file, with the same 403 problem and no
  retry.

If you do use it, the products still need publishing to the Headless channel
afterwards (`human-setup.md` step 4). That is not automatic.
