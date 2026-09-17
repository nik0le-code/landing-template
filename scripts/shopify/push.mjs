#!/usr/bin/env node
/**
 * Pushes `data/catalog.json` into Shopify through the Admin API.
 *
 *   npm run shopify:push                 collections, then products
 *   npm run shopify:push -- --dry-run    validate and print the plan, write nothing
 *   npm run shopify:push -- --limit=5    first 5 products, for a smoke test
 *   npm run shopify:push -- --only=collections
 *   npm run shopify:push -- --skip-images  re-run without re-uploading media
 *
 * Idempotent: everything is keyed on handle, so a second run updates and never
 * duplicates. Expect to re-run this more often than you think.
 *
 * Both collections and products are published to every sales channel after
 * writing. Skipping that is the classic "the Admin shows 200 products and the
 * site shows none" bug - the Storefront API only sees published resources.
 */
import { adminGraphQL, publicationInputs } from "./admin-client.mjs";
import { loadCatalog, validateCatalog } from "./catalog.mjs";
import { bad, heading, info, ok } from "./env.mjs";

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name) => args.find((arg) => arg.startsWith(`--${name}=`))?.split("=")[1];

const dryRun = flag("dry-run");
const skipImages = flag("skip-images");
const limit = value("limit") ? Number(value("limit")) : undefined;
const only = value("only");

const COLLECTION_BY_HANDLE = `query($handle: String!) { collectionByHandle(handle: $handle) { id } }`;
const COLLECTION_CREATE = `mutation($input: CollectionInput!) { collectionCreate(input: $input) { collection { id } userErrors { field message } } }`;
const COLLECTION_UPDATE = `mutation($input: CollectionInput!) { collectionUpdate(input: $input) { collection { id } userErrors { field message } } }`;
const PUBLISH = `mutation($id: ID!, $input: [PublicationInput!]!) { publishablePublish(id: $id, input: $input) { userErrors { field message } } }`;

// `identifier` is an argument of the mutation, not a field of ProductSetInput.
const PRODUCT_SET = `
  mutation($identifier: ProductSetIdentifiers!, $input: ProductSetInput!) {
    productSet(identifier: $identifier, input: $input, synchronous: true) {
      product { id handle variants(first: 100) { nodes { id sku } } }
      userErrors { field message code }
    }
  }`;

const catalog = loadCatalog();
const problems = validateCatalog(catalog);

heading(`Catalogue  ${catalog.collections.length} collections, ${catalog.products.length} products`);
if (problems.length) {
  for (const problem of problems.slice(0, 40)) bad(problem);
  if (problems.length > 40) info(`... and ${problems.length - 40} more`);
  console.error(`\n  ${problems.length} problem(s). Fix the importer, not the store.\n`);
  process.exit(1);
}
ok("validates");

if (dryRun) {
  for (const collection of catalog.collections) info(`collection ${collection.handle} - ${collection.title}`);
  for (const product of (limit ? catalog.products.slice(0, limit) : catalog.products)) {
    info(`product    ${product.handle.padEnd(40)} ${String(product.variants.length).padStart(3)}v  ${(product.images ?? []).length} img  [${(product.collections ?? []).join(", ")}]`);
  }
  console.log("\nDry run - nothing was written.\n");
  process.exit(0);
}

const { nodes, input: publishTo } = await publicationInputs();
heading(`Publishing to: ${nodes.map((publication) => publication.name).join(", ")}`);

// ---------------------------------------------------------------- collections

const collectionIds = {};
if (only !== "products") {
  heading("Collections");
  for (const [index, collection] of catalog.collections.entries()) {
    const input = {
      handle: collection.handle,
      title: collection.title,
      ...(collection.description && { descriptionHtml: `<p>${collection.description}</p>` }),
      ...(collection.image && !skipImages && { image: { src: collection.image } }),
      ...(collection.metafields && { metafields: collection.metafields }),
    };
    const existing = (await adminGraphQL(COLLECTION_BY_HANDLE, { handle: collection.handle })).collectionByHandle;
    const data = existing
      ? await adminGraphQL(COLLECTION_UPDATE, { input: { ...input, id: existing.id } })
      : await adminGraphQL(COLLECTION_CREATE, { input });
    collectionIds[collection.handle] = existing ? data.collectionUpdate.collection.id : data.collectionCreate.collection.id;
    await adminGraphQL(PUBLISH, { id: collectionIds[collection.handle], input: publishTo });
    console.log(`  ${existing ? "~" : "+"} ${String(index + 1).padStart(3)}/${catalog.collections.length}  ${collection.handle}`);
  }
} else {
  // Products still need the ids to attach themselves.
  for (const collection of catalog.collections) {
    const existing = (await adminGraphQL(COLLECTION_BY_HANDLE, { handle: collection.handle })).collectionByHandle;
    if (existing) collectionIds[collection.handle] = existing.id;
  }
}

// ---------------------------------------------------------------- products

if (only !== "collections") {
  const products = limit ? catalog.products.slice(0, limit) : catalog.products;
  heading(`Products${skipImages ? " (images skipped)" : ""}`);

  let pushed = 0;
  for (const product of products) {
    const optionNames = (product.options ?? []).map((option) => option.name);
    const input = {
      handle: product.handle,
      title: product.title,
      status: product.status ?? "ACTIVE",
      ...(product.descriptionHtml && { descriptionHtml: product.descriptionHtml }),
      ...(product.vendor && { vendor: product.vendor }),
      ...(product.productType && { productType: product.productType }),
      ...(product.tags?.length && { tags: product.tags }),
      ...(product.collections?.length && { collections: product.collections.map((handle) => collectionIds[handle]).filter(Boolean) }),
      ...(optionNames.length && {
        productOptions: product.options.map((option) => ({ name: option.name, values: option.values.map((name) => ({ name })) })),
      }),
      variants: product.variants.map((variant) => ({
        sku: variant.sku,
        price: String(variant.price),
        compareAtPrice: variant.compareAtPrice != null ? String(variant.compareAtPrice) : null,
        ...(optionNames.length && {
          optionValues: optionNames.map((name) => ({ optionName: name, name: variant.options[name] })),
        }),
        // Untracked stock never shows "sold out"; set tracked when the client keeps real counts.
        inventoryItem: { tracked: Boolean(variant.tracked) },
        inventoryPolicy: variant.tracked ? "DENY" : "CONTINUE",
        taxable: variant.taxable ?? true,
      })),
      ...(!skipImages && product.images?.length && {
        files: product.images.slice(0, 20).map((url) => ({ originalSource: url, contentType: "IMAGE" })),
      }),
      ...(product.metafields?.length && { metafields: product.metafields }),
    };

    const data = await adminGraphQL(PRODUCT_SET, { identifier: { handle: product.handle }, input });
    await adminGraphQL(PUBLISH, { id: data.productSet.product.id, input: publishTo });
    pushed++;
    console.log(`  + ${String(pushed).padStart(3)}/${products.length}  ${product.handle.slice(0, 44).padEnd(44)} ${String(product.variants.length).padStart(3)}v`);
  }
  heading(`${pushed} products pushed.`);
}

console.log("\nNext: npm run shopify:verify  (confirms the storefront actually sees it)\n");
