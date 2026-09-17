#!/usr/bin/env node
/**
 * Admin-side check, run before any push.
 *
 * OAuth grants the intersection of what the app declares and what was requested,
 * so a scope missing from the app's Configuration is silently absent and shows up
 * as ACCESS_DENIED halfway through an import. This turns that into one clear
 * message before anything is written.
 *
 *   npm run shopify:preflight
 */
import { adminConfig, adminGraphQL, grantedScopes, missingScopes, REQUIRED_SCOPES } from "./admin-client.mjs";
import { bad, heading, info, mask, ok } from "./env.mjs";

const { domain, adminToken, apiVersion } = adminConfig();

heading("Admin token");
ok(`store     ${domain}`);
ok(`api       ${apiVersion}`);
ok(`token     ${mask(adminToken)}`);

heading("Scopes");
const granted = await grantedScopes();
const missing = missingScopes(granted);
if (missing.length) {
  for (const scope of missing) bad(`missing ${scope}`);
  console.error(`
  Fix: Dev Dashboard -> your app -> Configuration -> add the scopes above,
       release a new app version, then re-run: npm run shopify:oauth
`);
  process.exit(1);
}
ok(`all ${REQUIRED_SCOPES.length} required scopes granted (${granted.length} total)`);

heading("Store");
const data = await adminGraphQL(`{
  shop { name currencyCode }
  productsCount { count }
  collections(first: 250) { nodes { handle } }
  publications(first: 25) { nodes { name } }
  locations(first: 5) { nodes { name } }
}`);

ok(`shop          ${data.shop.name} (${data.shop.currencyCode})`);
ok(`products      ${data.productsCount.count}`);
ok(`collections   ${data.collections.nodes.length}`);
ok(`location      ${data.locations.nodes[0]?.name ?? "-"}`);

const publications = data.publications.nodes.map((publication) => publication.name);
ok(`channels      ${publications.join(", ") || "-"}`);
if (!publications.some((name) => /headless|storefront api|custom app/i.test(name))) {
  bad("no Headless channel found");
  info("Shopify admin -> Sales channels -> + -> Headless, then create a storefront.");
  info("Without it, everything pushed here stays invisible to the Storefront API.");
  process.exit(1);
}

console.log("\nReady to push.\n");
