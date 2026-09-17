/**
 * `.env` access for the Shopify scripts.
 *
 * These scripts run outside Astro (plain node, before or after a build), so they
 * read `.env` themselves rather than going through `astro:env`. The running site
 * never imports anything in this folder — it reads the same variables through
 * `src/modules/shopify/lib/config.ts`.
 *
 * Which variables the deployed site needs, and which are import-time only:
 *
 *   site + scripts   SHOPIFY_STORE_DOMAIN, SHOPIFY_API_VERSION
 *   site only        SHOPIFY_STOREFRONT_TOKEN, SHOPIFY_STOREFRONT_PRIVATE_TOKEN,
 *                    SHOPIFY_WEBHOOK_SECRET
 *   scripts only     SHOPIFY_ADMIN_TOKEN, SHOPIFY_APP_CLIENT_ID,
 *                    SHOPIFY_APP_CLIENT_SECRET
 *
 * Keep the admin token out of the deployed environment: serving a storefront
 * never needs it, and it can rewrite the whole catalogue.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
export const ENV_PATH = path.join(ROOT, ".env");

/** Parses `.env` without a dependency. Quotes are stripped, comment lines ignored. */
export function readEnv() {
  const env = {};
  if (!existsSync(ENV_PATH)) return env;
  for (const line of readFileSync(ENV_PATH, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!match) continue;
    env[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
  }
  return env;
}

/** Writes one key, replacing it in place when present so the comments survive. */
export function upsertEnv(key, value) {
  const text = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, "utf8") : "";
  const pattern = new RegExp(`^${key}=.*$`, "m");
  writeFileSync(ENV_PATH, pattern.test(text) ? text.replace(pattern, `${key}=${value}`) : `${text.trimEnd()}\n${key}=${value}\n`);
}

/** "my-store" and "https://my-store.myshopify.com/" both become the bare domain. */
export function normalizeDomain(raw) {
  const domain = (raw ?? "").trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
  return domain && !domain.includes(".") ? `${domain}.myshopify.com` : domain;
}

export const API_VERSION_DEFAULT = "2025-07";

export function shopifyEnv() {
  const env = readEnv();
  return {
    domain: normalizeDomain(env.SHOPIFY_STORE_DOMAIN),
    apiVersion: env.SHOPIFY_API_VERSION?.trim() || API_VERSION_DEFAULT,
    storefrontToken: env.SHOPIFY_STOREFRONT_TOKEN ?? "",
    storefrontPrivateToken: env.SHOPIFY_STOREFRONT_PRIVATE_TOKEN ?? "",
    adminToken: env.SHOPIFY_ADMIN_TOKEN ?? "",
    webhookSecret: env.SHOPIFY_WEBHOOK_SECRET ?? "",
    clientId: env.SHOPIFY_APP_CLIENT_ID ?? "",
    clientSecret: env.SHOPIFY_APP_CLIENT_SECRET ?? "",
    siteUrl: (env.SITE_URL ?? "").replace(/\/+$/, ""),
  };
}

/** Exits with a readable message instead of a stack trace; these are human errors. */
export function requireEnv(value, message) {
  if (value) return value;
  console.error(`\n  ${message}\n`);
  process.exit(1);
}

export const mask = (token) => (token ? `${token.slice(0, 6)}...${token.slice(-4)} (${token.length} chars)` : "-");

export const ok = (message) => console.log(`  [ok]   ${message}`);
export const bad = (message) => console.log(`  [FAIL] ${message}`);
export const warn = (message) => console.log(`  [warn] ${message}`);
export const info = (message) => console.log(`         ${message}`);
export const heading = (message) => console.log(`\n${message}`);
