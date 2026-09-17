#!/usr/bin/env node
/**
 * Storefront-side check: does the *site* see the store?
 *
 *   npm run shopify:verify
 *
 * This is the gate that matters, because the Admin API and the Storefront API
 * disagree regularly - a product can exist, be Active, and still be invisible
 * here because it was never published to the Headless channel. It asks the same
 * endpoint with the same credentials that `src/modules/shopify/lib/client.ts`
 * uses at runtime, so a pass here means the pages will render.
 *
 * Exits non-zero on anything that would ship a broken shop.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { API_VERSION_DEFAULT, bad, heading, info, mask, ok, shopifyEnv, warn } from "./env.mjs";

const env = shopifyEnv();
let failed = false;
const fail = (message) => {
  bad(message);
  failed = true;
};

// ---------------------------------------------------------------- module switch

heading("Module");
const configPath = path.join(process.cwd(), "modules.config.ts");
if (!existsSync(configPath)) {
  fail("modules.config.ts not found - run this from the project root.");
} else {
  const source = readFileSync(configPath, "utf8");
  const enabled = /\bshopify\s*:\s*true\b/.test(source);
  if (enabled) ok("shopify: true in modules.config.ts");
  else fail('shopify is off. Set `shopify: true` in modules.config.ts - the routes do not exist otherwise.');

  const basePath = source.match(/shopify\s*:\s*\{[^}]*basePath\s*:\s*"([^"]+)"/)?.[1] ?? "shop";
  const cartPath = source.match(/shopify\s*:\s*\{[^}]*cartPath\s*:\s*"([^"]+)"/)?.[1] ?? "cart";
  info(`routes: /<lang>/${basePath}, /<lang>/${cartPath}`);

  const pagesDir = path.join(process.cwd(), "src", "pages", "[lang]");
  for (const [name, segment] of [["basePath", basePath], ["cartPath", cartPath]]) {
    if (existsSync(path.join(pagesDir, `${segment}.astro`))) {
      fail(`${name} "${segment}" collides with src/pages/[lang]/${segment}.astro - the static page wins and the shop 404s.`);
    }
  }
  if (/\bcatalog\s*:\s*true\b/.test(source)) {
    const catalogBase = source.match(/catalog\s*:\s*\{[^}]*basePath\s*:\s*"([^"]+)"/)?.[1] ?? "products";
    if (catalogBase === basePath) fail(`catalog and shopify both use basePath "${basePath}" - give them different segments.`);
    else warn(`catalog is also on (${catalogBase}) - two product systems on one site is usually a mistake.`);
  }
}

// ---------------------------------------------------------------- credentials

heading("Credentials");
if (!env.domain) {
  fail("SHOPIFY_STORE_DOMAIN is empty. In dev the module falls back to mock.shop demo data; in production the shop is 503.");
  console.log("");
  process.exit(1);
}
const isMock = env.domain === "mock.shop";
if (isMock) warn("SHOPIFY_STORE_DOMAIN=mock.shop - this is Shopify's demo catalogue, not a real store.");
else ok(`domain    ${env.domain}`);

if (env.apiVersion !== API_VERSION_DEFAULT) warn(`api       ${env.apiVersion} (module default is ${API_VERSION_DEFAULT})`);
else ok(`api       ${env.apiVersion}`);

if (env.storefrontPrivateToken) ok(`token     private ${mask(env.storefrontPrivateToken)}`);
else if (env.storefrontToken) ok(`token     public  ${mask(env.storefrontToken)}`);
else if (!isMock) fail("Neither SHOPIFY_STOREFRONT_TOKEN nor SHOPIFY_STOREFRONT_PRIVATE_TOKEN is set.");

if (env.adminToken) warn("SHOPIFY_ADMIN_TOKEN is in .env. Fine locally for imports; never ship it to the server.");

// ---------------------------------------------------------------- storefront api

const endpoint = isMock ? "https://mock.shop/api" : `https://${env.domain}/api/${env.apiVersion}/graphql.json`;
const headers = { "Content-Type": "application/json" };
if (env.storefrontPrivateToken) headers["Shopify-Storefront-Private-Token"] = env.storefrontPrivateToken;
else if (env.storefrontToken) headers["X-Shopify-Storefront-Access-Token"] = env.storefrontToken;

async function storefront(query, variables = {}) {
  const response = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify({ query, variables }), signal: AbortSignal.timeout(15_000) });
  const text = await response.text();
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 300)}`);
  const json = JSON.parse(text);
  if (json.errors?.length) throw new Error(json.errors.map((error) => error.message).join("; "));
  return json.data;
}

heading("Storefront API");
let shop;
try {
  shop = (await storefront(`{ shop { name paymentSettings { currencyCode enabledPresentmentCurrencies } } }`)).shop;
  ok(`reachable ${shop.name} (${shop.paymentSettings.currencyCode})`);
} catch (error) {
  fail(`unreachable: ${error instanceof Error ? error.message : error}`);
  info("401/403 here means the token belongs to a different store, or it is an Admin token (shpat_) in a Storefront slot.");
  console.log("");
  process.exit(1);
}

let products = 0;
let withImage = 0;
let available = 0;
let cursor = null;
for (let page = 0; page < 20; page++) {
  const data = await storefront(
    `query($after: String) { products(first: 250, after: $after) { pageInfo { hasNextPage endCursor } nodes { availableForSale featuredImage { url } } } }`,
    { after: cursor },
  );
  for (const node of data.products.nodes) {
    products++;
    if (node.featuredImage) withImage++;
    if (node.availableForSale) available++;
  }
  if (!data.products.pageInfo.hasNextPage) break;
  cursor = data.products.pageInfo.endCursor;
}

const collections = (await storefront(`{ collections(first: 250) { nodes { handle title } } }`)).collections.nodes;

if (products === 0) {
  fail("0 products visible to the Storefront API.");
  info("Products must be Active AND published to the Headless channel.");
  info("Admin -> Products -> select all -> ... -> Publish, or re-run npm run shopify:push.");
} else {
  ok(`products      ${products}  (${available} in stock, ${withImage} with an image)`);
  if (withImage < products) warn(`${products - withImage} products have no image - cards fall back to a placeholder.`);
}

if (collections.length === 0) warn("0 collections. The shop works, but the sidebar has nothing to filter by.");
else ok(`collections   ${collections.length}  (${collections.slice(0, 5).map((collection) => collection.handle).join(", ")}${collections.length > 5 ? ", ..." : ""})`);

// ---------------------------------------------------------------- freshness + site

heading("Freshness");
if (env.webhookSecret) ok("SHOPIFY_WEBHOOK_SECRET set - /api/shopify/webhook will purge the page cache on edits.");
else warn("SHOPIFY_WEBHOOK_SECRET is empty. Edits in Admin appear only when the page cache expires (cacheSeconds).");

if (env.siteUrl) ok(`SITE_URL      ${env.siteUrl}`);
else warn("SITE_URL is empty - prerendered pages and the sitemap bake in the wrong origin.");

// ---------------------------------------------------------------- featured section

const featured = existsSync(configPath) ? readFileSync(configPath, "utf8").match(/featuredCollection\s*:\s*"([^"]*)"/)?.[1] ?? "" : "";
if (featured) {
  if (collections.some((collection) => collection.handle === featured)) ok(`featuredCollection "${featured}" exists`);
  else fail(`featuredCollection "${featured}" does not exist in the store - the home page section renders empty.`);
}

console.log("");
if (failed) {
  console.log("Not ready. Fix the [FAIL] lines above.\n");
  process.exit(1);
}
console.log("Storefront is wired up.\n");
