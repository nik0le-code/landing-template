#!/usr/bin/env node
/**
 * Registers the cache-invalidation webhooks against `/api/shopify/webhook`.
 *
 *   npm run shopify:webhooks                        uses SITE_URL from .env
 *   npm run shopify:webhooks -- --url=https://x.gr  override
 *   npm run shopify:webhooks -- --list              show what is registered
 *
 * Doing this through the Admin API instead of Settings -> Notifications saves the
 * click-through, but it changes which secret signs the payload:
 *
 *   registered here (by the app)      signed with the app's CLIENT SECRET
 *   registered in Admin > Notifications  signed with the secret on that page
 *
 * So after running this, SHOPIFY_WEBHOOK_SECRET must be SHOPIFY_APP_CLIENT_SECRET.
 * Get that wrong and every delivery is a 401 from `verifyWebhook`, silently, and
 * the site serves a stale catalogue until `cacheSeconds` expires.
 */
import { adminGraphQL } from "./admin-client.mjs";
import { bad, heading, info, ok, shopifyEnv, warn } from "./env.mjs";

const TOPICS = [
  "PRODUCTS_CREATE",
  "PRODUCTS_UPDATE",
  "PRODUCTS_DELETE",
  "COLLECTIONS_CREATE",
  "COLLECTIONS_UPDATE",
  "COLLECTIONS_DELETE",
  "INVENTORY_LEVELS_UPDATE",
];

const LIST = `
  query {
    webhookSubscriptions(first: 100) {
      nodes { id topic endpoint { ... on WebhookHttpEndpoint { callbackUrl } } }
    }
  }`;
const CREATE = `
  mutation($topic: WebhookSubscriptionTopic!, $subscription: WebhookSubscriptionInput!) {
    webhookSubscriptionCreate(topic: $topic, webhookSubscription: $subscription) {
      webhookSubscription { id }
      userErrors { field message }
    }
  }`;
const DELETE = `mutation($id: ID!) { webhookSubscriptionDelete(id: $id) { userErrors { field message } } }`;

const args = process.argv.slice(2);
const env = shopifyEnv();
const siteUrl = (args.find((arg) => arg.startsWith("--url="))?.split("=")[1] ?? env.siteUrl).replace(/\/+$/, "");

const existing = (await adminGraphQL(LIST)).webhookSubscriptions.nodes;

if (args.includes("--list")) {
  heading(`Registered webhooks (${existing.length})`);
  for (const node of existing) info(`${node.topic.padEnd(24)} ${node.endpoint?.callbackUrl ?? "(not http)"}`);
  console.log("");
  process.exit(0);
}

if (!siteUrl || !/^https:\/\//.test(siteUrl)) {
  bad("A public https URL is required. Set SITE_URL in .env or pass --url=https://...");
  info("Shopify will not deliver to http:// or to localhost; do this after the first deploy.");
  console.log("");
  process.exit(1);
}

const callbackUrl = `${siteUrl}/api/shopify/webhook`;
heading(`Target  ${callbackUrl}`);

// Drop this app's subscriptions that point somewhere else (a staging URL from a
// previous deploy keeps firing and looks like it works).
for (const node of existing) {
  const url = node.endpoint?.callbackUrl;
  if (url && url.endsWith("/api/shopify/webhook") && url !== callbackUrl) {
    await adminGraphQL(DELETE, { id: node.id });
    warn(`removed stale ${node.topic} -> ${url}`);
  }
}

const present = new Set(existing.filter((node) => node.endpoint?.callbackUrl === callbackUrl).map((node) => node.topic));

for (const topic of TOPICS) {
  if (present.has(topic)) {
    info(`= ${topic} already registered`);
    continue;
  }
  await adminGraphQL(CREATE, { topic, subscription: { callbackUrl, format: "JSON" } });
  ok(`+ ${topic}`);
}

heading("Secret");
if (!env.clientSecret) {
  warn("SHOPIFY_APP_CLIENT_SECRET is not in .env, so the value to use cannot be printed.");
  info("Dev Dashboard -> your app -> App settings -> Credentials -> Secret.");
} else if (env.webhookSecret === env.clientSecret) {
  ok("SHOPIFY_WEBHOOK_SECRET already matches the app client secret.");
} else {
  bad("SHOPIFY_WEBHOOK_SECRET does not match SHOPIFY_APP_CLIENT_SECRET.");
  info("These webhooks are signed by the app, so set SHOPIFY_WEBHOOK_SECRET to the client secret");
  info("in .env and in the production environment, then redeploy.");
}

console.log(`
Verify: change a product title in Admin, then reload the product page.
The change shows immediately when the webhook is working, and only after
cacheSeconds when it is not.
`);
