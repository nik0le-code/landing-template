/**
 * Shopify Admin GraphQL client, used only by the import scripts.
 *
 * Three things it does that a plain fetch wrapper does not:
 *
 *  - Surfaces `userErrors`. Shopify returns most write failures as HTTP 200 with
 *    a populated userErrors array, so a status-only check reports success on a
 *    failed write.
 *  - Backs off before the leaky bucket runs dry, and retries THROTTLED.
 *  - `introspect <TypeName>` prints an input type's fields. Shopify's input
 *    shapes drift between API versions and the docs lag behind, so check the
 *    live schema before writing a mutation instead of trusting any guide.
 *
 *   node scripts/shopify/admin-client.mjs introspect ProductSetInput
 */
import { mask, shopifyEnv } from "./env.mjs";

/** Scopes the import scripts need. Trim it if a project pushes less. */
export const REQUIRED_SCOPES = [
  "read_products",
  "write_products",
  "read_publications",
  "write_publications",
  "read_files",
  "write_files",
  "read_metaobjects",
  "write_metaobjects",
  "write_metaobject_definitions",
  "read_inventory",
  "write_inventory",
  "read_locations",
];

export function adminConfig() {
  const env = shopifyEnv();
  if (!env.domain) {
    console.error("\n  SHOPIFY_STORE_DOMAIN is missing from .env\n");
    process.exit(1);
  }
  if (!env.adminToken) {
    console.error("\n  SHOPIFY_ADMIN_TOKEN is missing from .env - run: npm run shopify:oauth\n");
    process.exit(1);
  }
  return env;
}

export function missingScopes(granted) {
  const have = new Set(granted);
  // A write scope implies its read counterpart; Shopify does not list both.
  for (const scope of granted) if (scope.startsWith("write_")) have.add(scope.replace("write_", "read_"));
  return REQUIRED_SCOPES.filter((scope) => !have.has(scope));
}

/** Walks a response for `userErrors` arrays wherever Shopify nested them. */
export function collectUserErrors(node, found = []) {
  if (!node || typeof node !== "object") return found;
  if (Array.isArray(node)) {
    for (const item of node) collectUserErrors(item, found);
    return found;
  }
  for (const [key, value] of Object.entries(node)) {
    if (key === "userErrors" && Array.isArray(value)) found.push(...value);
    else collectUserErrors(value, found);
  }
  return found;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function adminGraphQL(query, variables = {}, attempt = 0) {
  const { domain, adminToken, apiVersion } = adminConfig();
  const response = await fetch(`https://${domain}/admin/api/${apiVersion}/graphql.json`, {
    method: "POST",
    headers: { "X-Shopify-Access-Token": adminToken, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });

  if ((response.status === 429 || response.status >= 500) && attempt < 5) {
    await sleep(2 ** attempt * 1000);
    return adminGraphQL(query, variables, attempt + 1);
  }
  if (!response.ok) throw new Error(`Admin API HTTP ${response.status}: ${(await response.text()).slice(0, 500)}`);

  const json = await response.json();

  if (json.errors) {
    if (json.errors.some((error) => error.extensions?.code === "THROTTLED") && attempt < 5) {
      await sleep(2 ** attempt * 1000);
      return adminGraphQL(query, variables, attempt + 1);
    }
    throw new Error(`Admin API errors: ${JSON.stringify(json.errors, null, 2)}`);
  }

  const userErrors = collectUserErrors(json.data);
  if (userErrors.length) throw new Error(`Admin API userErrors: ${JSON.stringify(userErrors, null, 2)}`);

  const throttle = json.extensions?.cost?.throttleStatus;
  if (throttle && throttle.currentlyAvailable < 200) {
    await sleep(Math.ceil(((1000 - throttle.currentlyAvailable) / throttle.restoreRate) * 1000));
  }
  return json.data;
}

export async function grantedScopes() {
  const { domain, adminToken } = adminConfig();
  const response = await fetch(`https://${domain}/admin/oauth/access_scopes.json`, {
    headers: { "X-Shopify-Access-Token": adminToken },
  });
  if (!response.ok) throw new Error(`access_scopes HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`);
  return (await response.json()).access_scopes.map((scope) => scope.handle);
}

/** Every sales channel the store can publish to, including Headless. */
export const PUBLICATIONS_QUERY = `query { publications(first: 25) { nodes { id name } } }`;
export const PUBLISH_MUTATION = `
  mutation($id: ID!, $input: [PublicationInput!]!) {
    publishablePublish(id: $id, input: $input) { userErrors { field message } }
  }`;

/**
 * Publication ids to publish to. Products and collections that are not published
 * to the Headless channel exist in the Admin and are invisible to the Storefront
 * API, which is the single most common "my store is empty" cause.
 */
export async function publicationInputs() {
  const nodes = (await adminGraphQL(PUBLICATIONS_QUERY)).publications.nodes;
  return { nodes, input: nodes.map((publication) => ({ publicationId: publication.id })) };
}

if (process.argv[2] === "introspect") {
  const typeName = process.argv[3];
  if (!typeName) {
    console.error("usage: node scripts/shopify/admin-client.mjs introspect <TypeName>");
    process.exit(1);
  }
  const data = await adminGraphQL(
    `query($name: String!) {
      __type(name: $name) {
        name kind
        inputFields { name type { name kind ofType { name kind ofType { name kind ofType { name kind } } } } }
      }
    }`,
    { name: typeName },
  );
  const type = data.__type;
  if (!type) {
    console.error(`No such type: ${typeName}`);
    process.exit(1);
  }
  const render = (node) => {
    if (!node) return "";
    if (node.kind === "NON_NULL") return `${render(node.ofType)}!`;
    if (node.kind === "LIST") return `[${render(node.ofType)}]`;
    return node.name || node.kind;
  };
  console.log(`${type.name} (${type.kind})  api ${adminConfig().apiVersion}  token ${mask(adminConfig().adminToken)}`);
  for (const field of type.inputFields ?? []) console.log(`  ${field.name}: ${render(field.type)}`);
}
