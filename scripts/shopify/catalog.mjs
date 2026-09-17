/**
 * The import format (`data/catalog.json`) and its validator.
 *
 * Every importer - a vendor feed, a spreadsheet, a scrape - normalises into this
 * one shape, and only this shape is pushed. That split is what makes an import
 * testable without touching the network: the messy per-source code is pure
 * functions with unit tests, and `push.mjs` stays boring.
 *
 * The validator exists to reject what the Admin API would reject slowly, or
 * accept and embarrass you with. Every trap a project hits should be added here,
 * so the next vendor feed cannot reintroduce it.
 *
 *   {
 *     "collections": [
 *       { "handle": "sofas", "title": "Sofas", "description": "", "image": "https://..." }
 *     ],
 *     "products": [{
 *       "handle": "milano-sofa",
 *       "title": "Milano Sofa",
 *       "descriptionHtml": "<p>...</p>",
 *       "vendor": "Acme",  "productType": "Sofa",  "status": "ACTIVE",
 *       "tags": ["new"],
 *       "collections": ["sofas"],
 *       "options": [{ "name": "Colour", "values": ["Grey", "Beige"] }],
 *       "variants": [{
 *         "sku": "MIL-GREY", "price": "899.00", "compareAtPrice": "1099.00",
 *         "options": { "Colour": "Grey" },
 *         "tracked": false, "quantity": 0
 *       }],
 *       "images": ["https://..."],
 *       "metafields": [
 *         { "namespace": "custom", "key": "material", "type": "single_line_text_field", "value": "Oak" }
 *       ]
 *     }]
 *   }
 *
 * A product with no options: omit `options` and give one variant with no
 * `options` key. Shopify creates its default "Title / Default Title" variant.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export const CATALOG_PATH = path.join(process.cwd(), "data", "catalog.json");

export const HANDLE_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

export function loadCatalog(file = CATALOG_PATH) {
  if (!existsSync(file)) {
    console.error(`\n  ${path.relative(process.cwd(), file)} not found.\n  Write the importer that produces it first - the shape is documented in scripts/shopify/catalog.mjs.\n`);
    process.exit(1);
  }
  const catalog = JSON.parse(readFileSync(file, "utf8"));
  return { collections: catalog.collections ?? [], products: catalog.products ?? [] };
}

/** Returns a list of human-readable problems; empty means the catalogue is pushable. */
export function validateCatalog({ collections, products }) {
  const problems = [];
  const collectionHandles = new Set();
  const productHandles = new Set();
  const skus = new Set();

  for (const collection of collections) {
    if (!HANDLE_PATTERN.test(collection.handle ?? "")) problems.push(`collection handle not url-safe: "${collection.handle}"`);
    if (collectionHandles.has(collection.handle)) problems.push(`duplicate collection handle: ${collection.handle}`);
    collectionHandles.add(collection.handle);
    if (!collection.title) problems.push(`collection ${collection.handle}: empty title`);
    if (collection.image && !/^https:\/\//.test(collection.image)) problems.push(`collection ${collection.handle}: image is not https`);
  }

  for (const product of products) {
    const id = product.handle ?? product.title ?? "<unnamed>";
    if (!HANDLE_PATTERN.test(product.handle ?? "")) problems.push(`product handle not url-safe: "${product.handle}"`);
    if (productHandles.has(product.handle)) problems.push(`duplicate product handle: ${product.handle}`);
    productHandles.add(product.handle);
    if (!product.title) problems.push(`${id}: empty title`);
    if (product.status && !["ACTIVE", "DRAFT", "ARCHIVED"].includes(product.status)) problems.push(`${id}: bad status "${product.status}"`);

    for (const handle of product.collections ?? []) {
      if (!collectionHandles.has(handle)) problems.push(`${id}: references unknown collection "${handle}"`);
    }

    for (const url of product.images ?? []) {
      if (typeof url !== "string") problems.push(`${id}: images contains a ${typeof url}, expected a url string`);
      else if (!/^https:\/\//.test(url)) problems.push(`${id}: image is not https: "${url.slice(0, 60)}"`);
    }
    if ((product.images ?? []).length > 20) problems.push(`${id}: ${product.images.length} images; Shopify takes the first 20 per productSet call`);

    for (const metafield of product.metafields ?? []) {
      if (!metafield.namespace || !metafield.key || !metafield.type) problems.push(`${id}: metafield needs namespace, key and type`);
      if (metafield.type?.startsWith("list.") && typeof metafield.value === "string" && !metafield.value.startsWith("[")) {
        problems.push(`${id}: metafield ${metafield.key} is a list type, so value must be a JSON-encoded array string`);
      }
    }

    const declared = new Map((product.options ?? []).map((option) => [option.name, new Set(option.values)]));
    const variants = product.variants ?? [];
    if (!variants.length) problems.push(`${id}: no variants`);
    if (variants.length > 100) problems.push(`${id}: ${variants.length} variants; Shopify's limit is 100 per product`);

    const seenCombination = new Set();
    for (const variant of variants) {
      const label = `${id}/${variant.sku ?? "<no sku>"}`;
      if (!variant.sku) problems.push(`${id}: variant without a sku`);
      else if (skus.has(variant.sku)) problems.push(`duplicate sku across the catalogue: ${variant.sku}`);
      skus.add(variant.sku);

      if (!(Number(variant.price) > 0)) problems.push(`${label}: price must be a positive number`);
      if (variant.compareAtPrice != null && !(Number(variant.compareAtPrice) > Number(variant.price))) {
        problems.push(`${label}: compareAtPrice must exceed price, or the badge claims a fake discount`);
      }

      const pairs = Object.entries(variant.options ?? {});
      if (pairs.length !== declared.size) problems.push(`${label}: sets ${pairs.length} option(s), the product declares ${declared.size}`);
      for (const [name, value] of pairs) {
        if (!declared.has(name)) problems.push(`${label}: option "${name}" is not declared on the product`);
        else if (!declared.get(name).has(value)) problems.push(`${label}: option value "${value}" is not in the declared values for "${name}"`);
      }
      const combination = pairs.map(([name, value]) => `${name}=${value}`).sort().join("|");
      if (seenCombination.has(combination)) problems.push(`${id}: two variants share the option combination ${combination || "(none)"}`);
      seenCombination.add(combination);
    }
  }
  return problems;
}
