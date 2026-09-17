#!/usr/bin/env node
/**
 * One-time OAuth to get an Admin API token for a Shopify Dev Dashboard app.
 *
 * Legacy custom apps (which showed an Admin token in the UI) are retired. A Dev
 * Dashboard app never displays a token; it receives one through the OAuth
 * authorization-code grant. This performs that grant locally and writes
 * SHOPIFY_ADMIN_TOKEN into `.env`.
 *
 *   npm run shopify:oauth
 *
 * Needs in .env: SHOPIFY_STORE_DOMAIN, SHOPIFY_APP_CLIENT_ID,
 * SHOPIFY_APP_CLIENT_SECRET - and http://localhost:3456/callback registered on
 * the app as an allowed redirection URL.
 */
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { REQUIRED_SCOPES } from "./admin-client.mjs";
import { shopifyEnv, upsertEnv } from "./env.mjs";

const PORT = 3456; // must match the redirect URL registered on the app
const REDIRECT_URI = `http://localhost:${PORT}/callback`;

const { domain, clientId, clientSecret } = shopifyEnv();

if (!domain) {
  console.error("\n  SHOPIFY_STORE_DOMAIN is missing from .env\n");
  process.exit(1);
}
if (!clientId || !clientSecret) {
  console.error(`
  SHOPIFY_APP_CLIENT_ID / SHOPIFY_APP_CLIENT_SECRET are missing from .env.

  Dev Dashboard -> your app -> App settings -> Credentials
  Client ID is shown; the secret needs the eye icon to reveal.

  SHOPIFY_APP_CLIENT_ID=...
  SHOPIFY_APP_CLIENT_SECRET=...
`);
  process.exit(1);
}

const state = randomBytes(16).toString("hex");
const authorizeUrl =
  `https://${domain}/admin/oauth/authorize` +
  `?client_id=${encodeURIComponent(clientId)}` +
  `&scope=${encodeURIComponent(REQUIRED_SCOPES.join(","))}` +
  `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
  `&state=${state}`;

const page = (title, body) =>
  `<body style="font:16px system-ui;padding:3rem;max-width:34rem"><h2>${title}</h2><p>${body}</p></body>`;

const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://localhost:${PORT}`);
  if (url.pathname !== "/callback") return void response.writeHead(404).end("not found");

  const fail = (status, message) => {
    response.writeHead(status, { "Content-Type": "text/html; charset=utf-8" }).end(page("Failed", message));
    console.error(`\n  ${message}\n`);
    server.close();
    process.exit(1);
  };

  if (url.searchParams.get("state") !== state) return fail(400, "State mismatch. Re-run the script and use the fresh URL.");
  const code = url.searchParams.get("code");
  if (!code) return fail(400, `No code returned. Shopify said: ${url.search}`);

  try {
    const exchange = await fetch(`https://${domain}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
    });
    const body = await exchange.text();
    if (!exchange.ok) throw new Error(`token exchange HTTP ${exchange.status}: ${body.slice(0, 300)}`);

    const json = JSON.parse(body);
    upsertEnv("SHOPIFY_ADMIN_TOKEN", json.access_token);

    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(page("Token saved", "Written to <code>.env</code>. Close this tab and go back to the terminal."));

    console.log(`\n  Token saved to .env`);
    console.log(`  prefix  : ${json.access_token.slice(0, 6)}... (${json.access_token.length} chars)`);
    console.log(`  granted : ${json.scope}`);
    console.log(`\n  Next: npm run shopify:preflight\n`);
  } catch (error) {
    return fail(500, String(error instanceof Error ? error.message : error));
  }
  server.close();
  process.exit(0);
});

server.listen(PORT, () => {
  console.log(`
Listening on ${REDIRECT_URI}

1. Confirm this exact URL is registered on the app:
     Dev Dashboard -> your app -> Configuration -> allowed redirection URLs
     ${REDIRECT_URI}

2. Open this in the browser where you are logged into the store:

${authorizeUrl}

3. Click Install / Update. The token lands in .env by itself.
`);
});
