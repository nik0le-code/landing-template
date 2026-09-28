#!/usr/bin/env node
/**
 * Strapi CLI for the strapi module.
 *
 *   npm run strapi:up [-- --demo]        local Strapi in Docker: admin user, read-only token, .env wired
 *   npm run strapi:down [-- --volumes]   stop it (--volumes also deletes its data and uploads)
 *   npm run strapi:fields                regenerate the site pages' content types from src/i18n + editable-pages.ts
 *   npm run strapi:sync [-- --force]     fill empty site-page fields with the site's copy and images (--force: all)
 *   npm run strapi:secrets               secrets for a production Strapi (APP_KEYS, salts…)
 *   npm run strapi -- <command>          any Strapi CLI command inside the container
 *
 * Strapi runs in production mode (prebuilt admin, no watchers, SQLite), so it idles at
 * about 200 MB. Content types live in src/modules/strapi/strapi/src and are mounted into
 * the container: the Content-Type Builder is off, `strapi:fields` + a restart change them.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import modulesConfig from "../modules.config";
import { editablePages, type EditableImage } from "../src/config/editable-pages";
import { siteConfig } from "../site.config";
import { mergeOptions } from "../src/modules/merge";
import { strapiDefaults, type StrapiOptions } from "../src/modules/strapi/options";
import type { FieldLabel, SiteField, SitePagesFile } from "../src/modules/strapi/lib/site-fields";

const ROOT = process.cwd();
const ENV_FILE = path.join(ROOT, ".env");
try {
  process.loadEnvFile(ENV_FILE);
} catch {
  // No .env yet: `up` creates it.
}
const STRAPI_DIR = path.join(ROOT, "src/modules/strapi/strapi");
const COMPOSE = path.join(STRAPI_DIR, "compose.yml");

const { positionals, values: flags } = parseArgs({
  allowPositionals: true,
  strict: false,
  options: {
    demo: { type: "boolean", default: false },
    force: { type: "boolean", default: false },
    volumes: { type: "boolean", default: false },
    port: { type: "string" },
    "site-url": { type: "string" },
  },
});
const [command] = positionals;

const fail = (message: string): never => {
  console.error(`✗ ${message}`);
  process.exit(1);
};
const info = (message: string) => console.log(`• ${message}`);
const done = (message: string) => console.log(`✓ ${message}`);
const warn = (message: string) => console.warn(`! ${message}`);

const options = () =>
  mergeOptions(strapiDefaults as unknown as Record<string, unknown>, modulesConfig.options?.strapi as Record<string, unknown> | undefined) as unknown as StrapiOptions;

const port = () => String(flags.port ?? process.env.STRAPI_PORT ?? "1337");
const localUrl = () => `http://localhost:${port()}`;

// ---------------------------------------------------------------- site pages → content types

const humanize = (key: string) =>
  key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/^./, (c) => c.toUpperCase())
    .replace(/\bcta\b/i, "Call to action")
    .replace(/^Meta$/, "SEO");

const kebab = (value: string) =>
  value
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
const snake = (value: string) => kebab(value).replace(/-/g, "_");

// Strapi reserves these attribute names (utils.contentTypes.getReservedAttributeNames()).
const RESERVED = new Set(["id", "document_id", "created_at", "updated_at", "published_at", "created_by_id", "updated_by_id", "created_by", "updated_by", "entry_id", "localizations", "meta", "locale", "status"]);
const attrName = (key: string) => {
  let name = key.replace(/[^A-Za-z0-9_]/g, "_");
  if (!/^[A-Za-z]/.test(name)) name = `f${name}`;
  return RESERVED.has(snake(name)) || /^_*strapi/i.test(name) ? `${name}Fields` : name;
};

const LONG_TEXT = /description|bio|quote|answer|text|body|note|content/i;
const LOCALIZED = { i18n: { localized: true } };
const hint = (value: string) => (value.length > 120 ? `${value.slice(0, 117)}…` : value);

type Attribute = Record<string, unknown>;

interface Generated {
  files: Map<string, string>;
  labels: Record<string, Record<string, FieldLabel>>;
}

/** Content type, components and field tree for one editable page. */
function generatePage(pageKey: string, copy: Record<string, unknown>, images: Record<string, EditableImage>, out: Generated) {
  const category = `site-${kebab(pageKey)}`;

  const imagesAt = (parent: string): [string, EditableImage][] =>
    Object.entries(images).filter(([imagePath]) => (imagePath.includes(".") ? imagePath.slice(0, imagePath.lastIndexOf(".")) : "") === parent);

  /** Attributes, labels and field nodes for the entries of one object (a page, group or list item). */
  const build = (dotPath: string, entries: [string, unknown][]) => {
    const attributes: Record<string, Attribute> = {};
    const labels: Record<string, FieldLabel> = {};
    const fields: SiteField[] = [];
    for (const [key, value] of entries) {
      const attr = attrName(key);
      const childPath = dotPath ? `${dotPath}.${key}` : key;
      const label = humanize(key);
      if (typeof value === "string") {
        const long = LONG_TEXT.test(key) || value.length > 80;
        attributes[attr] = { type: long ? "text" : "string" };
        const icon = key === "icon" ? " Icon name from lucide.dev/icons, e.g. zap." : "";
        labels[attr] = { label, placeholder: hint(value), description: `Empty: ${hint(value)}${icon}` };
        fields.push({ kind: "value", key, attr });
      } else if (typeof value === "number") {
        attributes[attr] = { type: "decimal" };
        labels[attr] = { label, placeholder: String(value), description: `Empty: ${value}` };
        fields.push({ kind: "value", key, attr });
      } else if (typeof value === "boolean") {
        attributes[attr] = { type: "boolean", default: value };
        labels[attr] = { label };
        fields.push({ kind: "value", key, attr });
      } else if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
        const uid = component(`${childPath}.item`, `${humanize(key)} item`, [["value", ""]], { value: { label: humanize(key).replace(/s$/, ""), mainField: true } });
        attributes[attr] = { type: "component", repeatable: true, component: uid };
        labels[attr] = { label, description: `Empty list: the site's items (${hint((value as string[]).join(", "))}).` };
        fields.push({ kind: "strings", key, attr });
      } else if (Array.isArray(value)) {
        // Every key any item uses, in first-seen order; hints from the first item that has it.
        const sample: Record<string, unknown> = {};
        for (const item of value as Record<string, unknown>[]) for (const [itemKey, itemValue] of Object.entries(item)) if (!(itemKey in sample)) sample[itemKey] = itemValue;
        const { uid, fields: children } = group(childPath, Object.entries(sample), true);
        attributes[attr] = { type: "component", repeatable: true, component: uid };
        labels[attr] = { label, description: "Empty list: the site's own items. An edited list replaces them; empty fields in an item keep the site's item at that position." };
        fields.push({ kind: "list", key, attr, fields: children });
      } else if (value && typeof value === "object") {
        const { uid, fields: children } = group(childPath, Object.entries(value), false);
        attributes[attr] = { type: "component", repeatable: false, component: uid };
        labels[attr] = { label };
        fields.push({ kind: "group", key, attr, fields: children });
      }
    }
    for (const [imagePath, image] of imagesAt(dotPath)) {
      const key = imagePath.slice(imagePath.lastIndexOf(".") + 1);
      const attr = attrName(key);
      attributes[attr] = { type: "media", multiple: image.type === "gallery", allowedTypes: ["images"] };
      labels[attr] = { label: image.label, description: image.type === "gallery" ? "Empty: the site's own images." : "Empty: the site's own image." };
      fields.push({ kind: image.type, key, attr });
    }
    return { attributes, labels, fields };
  };

  const component = (dotPath: string, displayName: string, entries: [string, unknown][], labelOverrides?: Record<string, FieldLabel>) => {
    const name = kebab(dotPath);
    const uid = `${category}.${name}`;
    const { attributes, labels } = build(dotPath, entries);
    out.files.set(
      `src/components/${category}/${name}.json`,
      json({ collectionName: `components_${snake(category)}_${snake(name)}`, info: { displayName }, options: {}, attributes }),
    );
    out.labels[uid] = { ...labels, ...labelOverrides };
    return uid;
  };

  const group = (dotPath: string, entries: [string, unknown][], repeatable: boolean) => {
    const name = kebab(dotPath);
    const uid = `${category}.${name}`;
    const built = build(dotPath, entries);
    out.files.set(
      `src/components/${category}/${name}.json`,
      json({ collectionName: `components_${snake(category)}_${snake(name)}`, info: { displayName: dotPath.split(".").map(humanize).join(": ") }, options: {}, attributes: built.attributes }),
    );
    // Collapsed list items are titled by their first text field.
    const first = repeatable ? built.fields.find((field) => field.kind === "value" && typeof (entries.find(([key]) => key === field.key)?.[1]) === "string") : undefined;
    out.labels[uid] = Object.fromEntries(Object.entries(built.labels).map(([attr, label]) => [attr, first?.attr === attr ? { ...label, mainField: true } : label]));
    return { uid, fields: built.fields };
  };

  const { attributes, labels, fields } = build("", Object.entries(copy));
  const localized = Object.fromEntries(Object.entries(attributes).map(([attr, attribute]) => [attr, { ...attribute, pluginOptions: LOCALIZED }]));
  const apiPath = category;
  const uid = `api::${apiPath}.${apiPath}`;
  const base = `src/api/${apiPath}`;
  out.files.set(
    `${base}/content-types/${apiPath}/schema.json`,
    json({
      kind: "singleType",
      collectionName: snake(apiPath),
      info: { singularName: apiPath, pluralName: `${apiPath}s`, displayName: `Site page: ${humanize(pageKey)}`, description: `Copy of the site's page ${editablePages[pageKey as keyof typeof editablePages].path} (empty fields keep the site's copy)` },
      options: { draftAndPublish: false },
      pluginOptions: LOCALIZED,
      attributes: localized,
    }),
  );
  out.files.set(`${base}/routes/${apiPath}.js`, `// Generated by npm run strapi:fields. Read-only; the site reads with a read-only API token.\nmodule.exports = require("@strapi/strapi").factories.createCoreRouter("${uid}", { only: ["find"] });\n`);
  out.files.set(`${base}/controllers/${apiPath}.js`, `module.exports = require("@strapi/strapi").factories.createCoreController("${uid}");\n`);
  out.files.set(`${base}/services/${apiPath}.js`, `module.exports = require("@strapi/strapi").factories.createCoreService("${uid}");\n`);
  out.labels[uid] = labels;
  return { uid, apiPath, fields };
}

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

function readDictionary(lang: string, namespace: string): Record<string, unknown> {
  const file = path.join(ROOT, "src/i18n/locales", lang, `${namespace}.json`);
  return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>) : {};
}

/** Writes the generated content types, components and site-pages.json; returns whether anything changed. */
function writeFieldDefinitions(): boolean {
  const out: Generated = { files: new Map(), labels: {} };
  const pages: SitePagesFile["pages"] = {};
  if (options().content.sitePages) {
    for (const [key, page] of Object.entries(editablePages)) {
      const generated = generatePage(key, readDictionary(siteConfig.defaultLocale, key), page.images as Record<string, EditableImage>, out);
      pages[key] = { ...generated, path: page.path };
    }
  }
  const sitePages: SitePagesFile = { generatedBy: "npm run strapi:fields", locales: [...siteConfig.locales], defaultLocale: siteConfig.defaultLocale, pages, labels: out.labels };
  out.files.set("src/site-pages.json", json(sitePages));

  let changed = 0;
  for (const [relative, content] of out.files) {
    const file = path.join(STRAPI_DIR, relative);
    if (existsSync(file) && readFileSync(file, "utf8") === content) continue;
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, content);
    changed++;
  }
  // Pages or sections that no longer exist.
  for (const dir of ["src/api", "src/components"]) {
    for (const entry of readdirSync(path.join(STRAPI_DIR, dir), { withFileTypes: true })) {
      if (!entry.isDirectory() || !entry.name.startsWith("site-")) continue;
      const folder = path.join(STRAPI_DIR, dir, entry.name);
      if (dir === "src/api") {
        if (!out.files.has(`src/api/${entry.name}/content-types/${entry.name}/schema.json`)) {
          rmSync(folder, { recursive: true });
          changed++;
        }
        continue;
      }
      for (const file of readdirSync(folder)) {
        if (!out.files.has(`src/components/${entry.name}/${file}`)) {
          rmSync(path.join(folder, file));
          changed++;
        }
      }
      if (!readdirSync(folder).length) rmSync(folder, { recursive: true });
    }
  }
  const summary = Object.keys(pages).join(", ") || "none (content.sitePages is off)";
  done(`Site page content types ${changed ? "written" : "unchanged"}: ${summary}`);
  return changed > 0;
}

// ---------------------------------------------------------------- docker

function dockerAvailable() {
  try {
    execFileSync("docker", ["info"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const compose = (args: string[], env: Record<string, string> = {}) =>
  execFileSync("docker", ["compose", "-f", COMPOSE, ...args], { stdio: "inherit", env: { ...process.env, STRAPI_PORT: port(), ...env } });

function isRunning() {
  const result = spawnSync("docker", ["compose", "-f", COMPOSE, "ps", "--status", "running", "-q", "strapi"], { encoding: "utf8" });
  return result.status === 0 && result.stdout.trim() !== "";
}

async function waitForStrapi(url: string) {
  for (let attempt = 0; attempt < 90; attempt++) {
    try {
      if ((await fetch(`${url}/_health`, { signal: AbortSignal.timeout(2000) })).ok) return;
    } catch {
      // Still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  fail(`Strapi did not come up at ${url}. See: docker compose -f ${path.relative(ROOT, COMPOSE)} logs strapi`);
}

// ---------------------------------------------------------------- admin API

const ADMIN = { email: "admin@example.com", password: "Admin1234", firstname: "Admin" };

async function api<T>(url: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.token) headers.set("Authorization", `Bearer ${init.token}`);
  if (init.body && typeof init.body === "string") headers.set("Content-Type", "application/json");
  const response = await fetch(url, { ...init, headers });
  const text = await response.text();
  if (!response.ok) throw new Error(`${init.method ?? "GET"} ${url}: HTTP ${response.status} ${text.slice(0, 300)}`);
  return (text ? JSON.parse(text) : null) as T;
}

/** The first admin (admin@example.com / Admin1234) on a fresh Strapi, then an admin session. */
async function adminLogin(url: string): Promise<{ jwt: string; created: boolean }> {
  const { data } = await api<{ data: { hasAdmin: boolean } }>(`${url}/admin/init`);
  if (!data.hasAdmin) await api(`${url}/admin/register-admin`, { method: "POST", body: JSON.stringify(ADMIN) });
  const login = await api<{ data: { token?: string; accessToken?: string } }>(`${url}/admin/login`, { method: "POST", body: JSON.stringify({ email: ADMIN.email, password: ADMIN.password }) }).catch(() =>
    fail(`Could not log in as ${ADMIN.email}. If you changed the admin password, set STRAPI_TOKEN in .env to a read-only API token yourself.`),
  );
  const jwt = login.data.accessToken ?? login.data.token;
  if (!jwt) fail("Strapi's admin login returned no token.");
  return { jwt: jwt!, created: !data.hasAdmin };
}

async function tokenWorks(url: string, token: string | undefined) {
  if (!token) return false;
  const response = await fetch(`${url}/api/posts?pagination[pageSize]=1`, { headers: { Authorization: `Bearer ${token}` } }).catch(() => null);
  return response?.ok ?? false;
}

/** A read-only API token named "site" (recreated: Strapi shows a token's key only once). */
async function createSiteToken(url: string, jwt: string): Promise<string> {
  const { data: tokens } = await api<{ data: { id: number; name: string }[] }>(`${url}/admin/api-tokens`, { token: jwt });
  for (const token of tokens.filter((t) => t.name === "site")) await api(`${url}/admin/api-tokens/${token.id}`, { method: "DELETE", token: jwt });
  const { data } = await api<{ data: { accessKey: string } }>(`${url}/admin/api-tokens`, {
    method: "POST",
    token: jwt,
    body: JSON.stringify({ name: "site", description: "Read by the website (STRAPI_TOKEN)", type: "read-only", lifespan: null }),
  });
  return data.accessKey;
}

// ---------------------------------------------------------------- .env

/** Sets keys in .env, keeping everything else (comments, order, other keys). */
function upsertEnv(values: Record<string, string>): string[] {
  let content = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, "utf8") : "";
  const changed: string[] = [];
  for (const [key, value] of Object.entries(values)) {
    const line = `${key}=${value}`;
    const pattern = new RegExp(`^${key}=.*$`, "m");
    if (pattern.test(content)) {
      if (content.match(pattern)![0] === line) continue;
      content = content.replace(pattern, line);
    } else {
      content = `${content.replace(/\n*$/, content ? "\n" : "")}${line}\n`;
    }
    changed.push(key);
  }
  if (changed.length) writeFileSync(ENV_FILE, content);
  return changed;
}

// ---------------------------------------------------------------- demo content

type Blocks = unknown[];
const paragraph = (text: string) => ({ type: "paragraph", children: [{ type: "text", text }] });
const heading = (text: string) => ({ type: "heading", level: 2, children: [{ type: "text", text }] });

const DEMO: Record<string, { category: [string, string]; posts: { title: string; slug: string; excerpt: string; content: Blocks }[] }> = {
  el: {
    category: ["Νέα", "nea"],
    posts: [
      {
        title: "Καλώς ήρθατε στο νέο μας site",
        slug: "kalos-irthate",
        excerpt: "Αυτό το άρθρο γράφτηκε στο Strapi και εμφανίζεται με το design του site.",
        content: [
          paragraph("Αυτό το άρθρο γράφτηκε στο Strapi και εμφανίζεται με το design του site."),
          heading("Πώς λειτουργεί"),
          paragraph("Κάθε δημοσίευση καθαρίζει την cache αμέσως."),
          heading("Μεταφράσεις"),
          paragraph("Κάθε γλώσσα είναι μια τοπική εκδοχή του ίδιου άρθρου."),
          heading("Εικόνες"),
          paragraph("Οι εικόνες φορτώνονται από το Strapi σε πολλά μεγέθη."),
        ],
      },
      { title: "Τρεις συμβουλές για γρήγορα sites", slug: "grigora-sites", excerpt: "Μικρές αλλαγές με μεγάλη διαφορά.", content: [paragraph("Λιγότερο JavaScript, σωστές εικόνες, cache.")] },
    ],
  },
  en: {
    category: ["News", "news"],
    posts: [
      {
        title: "Welcome to our new site",
        slug: "welcome",
        excerpt: "This article was written in Strapi and is shown with the site's design.",
        content: [
          paragraph("This article was written in Strapi and is shown with the site's design."),
          heading("How it works"),
          paragraph("Every publish clears the cache right away."),
          heading("Translations"),
          paragraph("Each language is a locale of the same article."),
          heading("Images"),
          paragraph("Images load from Strapi in several sizes."),
        ],
      },
      { title: "Three tips for fast sites", slug: "fast-sites", excerpt: "Small changes, big difference.", content: [paragraph("Less JavaScript, right-sized images, caching.")] },
    ],
  },
};

async function seedDemo(url: string, jwt: string) {
  const cm = (uid: string) => `${url}/content-manager/collection-types/${uid}`;
  const { pagination } = await api<{ pagination: { total: number } }>(`${cm("api::post.post")}?page=1&pageSize=1`, { token: jwt });
  if (pagination.total > 0) return info("Demo content: already there");

  const covers = [await uploadFile(url, jwt, "src/assets/demo/hero.jpg"), await uploadFile(url, jwt, "src/assets/demo/about.jpg")];

  const [first, ...others] = [siteConfig.defaultLocale, ...siteConfig.locales.filter((l) => l !== siteConfig.defaultLocale)];
  const copy = (lang: string) => DEMO[lang] ?? DEMO.en!;
  /** One document, a locale per site language, published when the type has drafts. */
  const create = async (uid: string, data: (lang: string) => Record<string, unknown>, publish: boolean) => {
    const { data: created } = await api<{ data: { documentId: string } }>(`${cm(uid)}?locale=${first}`, { method: "POST", token: jwt, body: JSON.stringify(data(first!)) });
    for (const lang of others) await api(`${cm(uid)}/${created.documentId}?locale=${lang}`, { method: "PUT", token: jwt, body: JSON.stringify(data(lang)) });
    if (publish) for (const lang of [first!, ...others]) await api(`${cm(uid)}/${created.documentId}/actions/publish?locale=${lang}`, { method: "POST", token: jwt, body: "{}" });
    return created.documentId;
  };

  const category = await create("api::category.category", (lang) => ({ name: copy(lang).category[0], slug: copy(lang).category[1] }), false);
  for (const [index] of copy(first!).posts.entries()) {
    await create(
      "api::post.post",
      (lang) => ({ ...copy(lang).posts[index], cover: covers[index % covers.length], author: "Admin", category: { connect: [{ documentId: category, locale: lang }] } }),
      true,
    );
  }
  done("Demo content: 2 posts, 1 category");
}

// ---------------------------------------------------------------- site pages: code copy → Strapi

const MIME: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".avif": "image/avif", ".gif": "image/gif" };

/** Uploads a project file to the media library once (reused by file name); returns its id. */
async function uploadFile(url: string, jwt: string, file: string): Promise<number> {
  const name = path.basename(file);
  const existing = await api<{ results: { id: number }[] }>(`${url}/upload/files?filters[name][$eq]=${encodeURIComponent(name)}&pageSize=1`, { token: jwt });
  if (existing.results[0]) return existing.results[0].id;
  const form = new FormData();
  form.append("files", new Blob([readFileSync(path.join(ROOT, file))], { type: MIME[path.extname(file).toLowerCase()] ?? "application/octet-stream" }), name);
  const [uploaded] = await api<{ id: number }[]>(`${url}/upload`, { method: "POST", token: jwt, body: form });
  return uploaded!.id;
}

type Json = Record<string, unknown>;
const isEmpty = (value: unknown) => value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0);
const mediaId = (value: unknown) => (value && typeof value === "object" && "id" in value ? (value as { id: number }).id : null);

/**
 * The payload for one site page in one language: what's already in Strapi, with every
 * empty field filled from the code copy (all of them with `force`). Components are sent
 * without ids, so Strapi stores them fresh; media as ids.
 */
function sitePagePayload(fields: SiteField[], existing: Json | null | undefined, code: unknown, images: Map<string, number[]>, dotPath: string, force: boolean, stats: { filled: number }): Json {
  const copy = (code && typeof code === "object" ? code : {}) as Json;
  const out: Json = {};
  for (const field of fields) {
    const current = force ? undefined : existing?.[field.attr];
    const fieldPath = dotPath ? `${dotPath}.${field.key}` : field.key;
    const keep = !isEmpty(current);
    switch (field.kind) {
      case "value":
        out[field.attr] = keep ? current : (copy[field.key] ?? null);
        break;
      case "strings":
        out[field.attr] = keep ? (current as Json[]).map((row) => ({ value: row.value })) : ((copy[field.key] as string[] | undefined) ?? []).map((value) => ({ value }));
        break;
      case "image":
        out[field.attr] = keep ? mediaId(current) : (images.get(fieldPath)?.[0] ?? null);
        break;
      case "gallery":
        out[field.attr] = keep ? (current as unknown[]).map(mediaId) : (images.get(fieldPath) ?? []);
        break;
      case "group":
        out[field.attr] = sitePagePayload(field.fields, current as Json | undefined, copy[field.key], images, fieldPath, force, stats);
        continue;
      case "list": {
        const codeItems = (copy[field.key] as unknown[] | undefined) ?? [];
        const items = keep ? (current as Json[]) : codeItems.map(() => null);
        out[field.attr] = items.map((item, index) => sitePagePayload(field.fields, item, codeItems[index], images, fieldPath, force, stats));
        break;
      }
    }
    if (!keep && !isEmpty(out[field.attr])) stats.filled++;
  }
  return out;
}

/** Fills the site pages in Strapi with what the site shows (copy in every language, default images). */
async function syncSitePages(url: string, jwt: string, force: boolean) {
  const sitePages = JSON.parse(readFileSync(path.join(STRAPI_DIR, "src/site-pages.json"), "utf8")) as SitePagesFile;
  for (const [key, page] of Object.entries(sitePages.pages)) {
    const images = new Map<string, number[]>();
    for (const [imagePath, image] of Object.entries(editablePages[key as keyof typeof editablePages].images as Record<string, EditableImage>)) {
      const files = typeof image.src === "string" ? [image.src] : (image.src ?? []);
      if (files.length) images.set(imagePath, await Promise.all(files.map((file) => uploadFile(url, jwt, file))));
    }
    const filled: string[] = [];
    for (const lang of sitePages.locales) {
      const endpoint = `${url}/content-manager/single-types/${page.uid}?locale=${lang}`;
      const { data } = await api<{ data: Json | null }>(endpoint, { token: jwt }).catch(() => ({ data: null }));
      const existing = data && "id" in data ? data : null;
      const stats = { filled: 0 };
      const payload = sitePagePayload(page.fields, existing, readDictionary(lang, key), images, "", force, stats);
      if (!stats.filled && existing) continue;
      await api(endpoint, { method: "PUT", token: jwt, body: JSON.stringify(payload) });
      filled.push(`${lang} (${stats.filled})`);
    }
    info(`Site page "${key}": ${filled.length ? `filled ${filled.join(", ")}` : "up to date"}`);
  }
}

// ---------------------------------------------------------------- commands

function checkModuleConfig() {
  const modules = modulesConfig.modules as Record<string, boolean>;
  if (!modules.strapi) warn("strapi is off in modules.config.ts: set `strapi: true` for the site to read from it.");
  if (modules.strapi && modules.wordpress) warn("wordpress is on too: both provide posts, pages and page content. Switch one off.");
}

async function up() {
  if (!dockerAvailable()) fail("Docker is not running. Start Docker Desktop and try again.");
  checkModuleConfig();
  const url = localUrl();
  const siteUrl = String(flags["site-url"] ?? process.env.SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");

  writeFieldDefinitions();
  const secret = process.env.STRAPI_WEBHOOK_SECRET || randomBytes(24).toString("base64url");
  // Strapi runs in Docker: "localhost" there is the container, so notifications go to the host.
  const webhookUrl = new URL("/api/strapi/webhook", siteUrl);
  if (["localhost", "127.0.0.1"].includes(webhookUrl.hostname)) webhookUrl.hostname = "host.docker.internal";

  info(`Starting Strapi on ${url} (the first build takes a few minutes)`);
  // Recreated when the webhook settings change; otherwise a no-op if it's already running.
  compose(["up", "-d", "--build", "--wait"], { STRAPI_WEBHOOK_SECRET: secret, HEADLESS_WEBHOOK_URL: webhookUrl.toString() });
  await waitForStrapi(url);

  const { jwt, created } = await adminLogin(url);
  if (created) done(`Admin user created: ${ADMIN.email} / ${ADMIN.password}`);
  let token = process.env.STRAPI_TOKEN;
  if (!(await tokenWorks(url, token)) || process.env.STRAPI_URL !== url) {
    token = await createSiteToken(url, jwt);
    done("Read-only API token created for the site");
  }
  const changed = upsertEnv({ STRAPI_URL: url, STRAPI_TOKEN: token!, STRAPI_WEBHOOK_SECRET: secret });
  if (changed.length) done(`.env updated: ${changed.join(", ")} (restart npm run dev to pick them up)`);

  if (options().content.sitePages) await syncSitePages(url, jwt, false);
  if (flags.demo) await seedDemo(url, jwt);

  const { content, postsPath } = options();
  console.log(`
Strapi is running.
  admin   ${url}/admin   (${ADMIN.email} / ${ADMIN.password})
  site    ${siteUrl}${content.posts ? `   posts at /${siteConfig.defaultLocale}/${postsPath}` : ""}

In modules.config.ts: strapi: true. Site pages are under Content Manager → Single Types.`);
}

async function fields() {
  const changed = writeFieldDefinitions();
  if (!changed) return;
  if (!isRunning()) return info("Strapi isn't running; the changes apply on the next npm run strapi:up.");
  info("Restarting Strapi to load the changed content types");
  compose(["restart", "strapi"]);
  await waitForStrapi(localUrl());
  done("Strapi restarted");
  // New fields start with the site's copy too.
  if (options().content.sitePages) await syncSitePages(localUrl(), (await adminLogin(localUrl())).jwt, false);
}

function secrets() {
  const key = () => randomBytes(16).toString("base64");
  console.log(`# Production Strapi (set on the Strapi server/container, not the site)
APP_KEYS=${[key(), key(), key(), key()].join(",")}
API_TOKEN_SALT=${key()}
ADMIN_JWT_SECRET=${key()}
TRANSFER_TOKEN_SALT=${key()}
ENCRYPTION_KEY=${key()}
PUBLIC_URL=https://cms.example.com
HEADLESS_WEBHOOK_URL=https://www.example.com/api/strapi/webhook
HEADLESS_WEBHOOK_SECRET=${randomBytes(24).toString("base64url")}   # same value as STRAPI_WEBHOOK_SECRET on the site`);
}

switch (command) {
  case "up":
    await up();
    break;
  case "down":
    compose(["down", ...(flags.volumes ? ["--volumes"] : [])]);
    break;
  case "fields":
    await fields();
    break;
  case "sync": {
    if (!isRunning()) fail("Strapi isn't running: npm run strapi:up");
    if (!options().content.sitePages) fail("content.sitePages is off in modules.config.ts: there are no site pages to fill.");
    await syncSitePages(localUrl(), (await adminLogin(localUrl())).jwt, Boolean(flags.force));
    break;
  }
  case "secrets":
    secrets();
    break;
  case "cli": {
    const raw = process.argv.slice(process.argv.indexOf("cli") + 1);
    if (!raw.length) fail("Usage: npm run strapi -- <strapi command>, e.g. npm run strapi -- routes:list");
    if (!isRunning()) fail("Strapi isn't running: npm run strapi:up");
    compose(["exec", "strapi", "node", "node_modules/@strapi/strapi/bin/strapi.js", ...raw]);
    break;
  }
  default:
    fail("Usage: npm run strapi:up | strapi:fields | strapi:sync | strapi:down | strapi:secrets | strapi -- <strapi command>");
}
