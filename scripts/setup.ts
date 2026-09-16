#!/usr/bin/env node
/**
 * One-time project setup after cloning the template.
 *
 *   npm run setup
 *   npm run setup -- --name "Ανθός Florist" --domain https://anthos.gr --locales el \
 *                    --color "#2f855a" --email hello@anthos.gr --modules leads,media,blog \
 *                    --admin-email me@agency.gr --admin-name "Maria" --yes
 *
 * Rewrites site.config.ts, modules.config.ts, src/styles/theme.css, .env and the
 * locale files, regenerates brand assets, renames the git remote so `module:add`
 * keeps working, and optionally creates the first admin user.
 *
 * Safe to re-run: every step asks before changing anything (unless --yes).
 */
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { copyFileSync, existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createInterface, type Interface } from "node:readline/promises";
import { parseArgs } from "node:util";
import { listAvailableModules } from "../src/modules/resolve";

const ROOT = process.cwd();
const file = (...parts: string[]) => path.join(ROOT, ...parts);
const read = (relative: string) => readFileSync(file(relative), "utf8");
const write = (relative: string, contents: string) => writeFileSync(file(relative), contents);

const { values: flags } = parseArgs({
  options: {
    name: { type: "string" },
    domain: { type: "string" },
    locales: { type: "string" },
    color: { type: "string" },
    email: { type: "string" },
    phone: { type: "string" },
    modules: { type: "string" },
    "admin-email": { type: "string" },
    "admin-name": { type: "string" },
    origin: { type: "string" },
    yes: { type: "boolean", default: false },
  },
  allowPositionals: false,
});

const changes: string[] = [];
const notes: string[] = [];
const record = (message: string) => changes.push(message);
const warn = (message: string) => notes.push(`! ${message}`);

let rl: Interface | undefined;
const prompt = async (question: string, fallback = "") => {
  if (flags.yes || !process.stdin.isTTY) return fallback;
  rl ??= createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question(fallback ? `${question} [${fallback}] ` : `${question} `)).trim();
  return answer || fallback;
};
const confirm = async (question: string, fallback = true) => {
  if (flags.yes || !process.stdin.isTTY) return fallback;
  const answer = (await prompt(`${question} ${fallback ? "[Y/n]" : "[y/N]"}`)).toLowerCase();
  return answer === "" ? fallback : answer.startsWith("y");
};

/** Splits object-literal contents on top-level commas (ignores quotes and brackets). */
function splitEntries(inner: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote = "";
  let current = "";
  for (const char of inner) {
    if (quote) {
      if (char === quote) quote = "";
    } else if (`"'\``.includes(char)) quote = char;
    else if ("([{".includes(char)) depth += 1;
    else if (")]}".includes(char)) depth -= 1;
    else if (char === "," && depth === 0) {
      parts.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  parts.push(current);
  return parts.map((part) => part.trim()).filter(Boolean);
}

const isEntryFor = (entry: string, locale: string) => entry === locale || entry.startsWith(`${locale}:`) || entry.startsWith(`${locale} :`);

/**
 * Removes one locale entry from object literals: `{ el, en }`, `{ el: el, en: en }`,
 * `{ el: "el-GR", en: "en-US" }` and multi-line variants. Imports and identifiers
 * that merely start with the locale (`en2`) are left alone.
 */
export function dropLocale(source: string, locale: string): string {
  // Multi-line literals: the entry owns its own line.
  const out = source.replace(new RegExp(`^[ \\t]*${locale}\\s*(?::[^\\n]*)?,?[ \\t]*\\n`, "gm"), "");
  // Single-line literals (no nested braces in the files we touch).
  return out.replace(/\{([^{}\n]*)\}/g, (match, inner: string) => {
    const entries = splitEntries(inner);
    if (!entries.some((entry) => isEntryFor(entry, locale))) return match;
    const kept = entries.filter((entry) => !isEntryFor(entry, locale));
    return kept.length ? `{ ${kept.join(", ")} }` : "{}";
  });
}

/** Replaces `pattern` once; warns instead of throwing so setup never half-fails silently. */
function patch(relative: string, pattern: RegExp, replacement: string, label: string): void {
  const original = read(relative);
  if (!pattern.test(original)) {
    warn(`Could not update ${label} in ${relative} — check it by hand.`);
    return;
  }
  write(relative, original.replace(pattern, replacement));
}

// ---------------------------------------------------------------- steps

/**
 * Asks until the answer is valid, then normalizes it. A bad site URL or colour
 * reaches astro.config.ts / theme.css and breaks the build, so these are refused
 * rather than warned about; with --yes (or no terminal) there is nobody to ask,
 * so the run stops instead of writing something broken.
 */
async function ask(
  question: string,
  preset: string | undefined,
  fallback: string,
  check: (value: string) => string | null,
): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    // A value passed as a flag is used as-is when valid, and re-asked when not.
    const answer = attempt === 0 && preset !== undefined ? preset.trim() : (await prompt(question, fallback)).trim();
    const normalized = check(answer);
    if (normalized !== null) return normalized;
    const problem = `"${answer}" is not valid for: ${question.replace(/:$/, "")}`;
    if (flags.yes || !process.stdin.isTTY || attempt >= 4) {
      console.error(`\n✗ ${problem}`);
      process.exit(1);
    }
    console.log(`  ${problem} — try again.`);
  }
}

/** "client.gr" → "https://client.gr"; rejects anything that isn't a real http(s) origin. */
export function normalizeUrl(value: string): string | null {
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  // A bare word ("test") parses as https://test — require a dotted host or localhost.
  if (!url.hostname.includes(".") && url.hostname !== "localhost") return null;
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
}

export function normalizeColor(value: string): string | null {
  const hex = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(hex)) return hex;
  if (/^[0-9a-f]{6}$/.test(hex)) return `#${hex}`;
  if (/^#?[0-9a-f]{3}$/.test(hex)) return `#${hex.replace("#", "").replace(/./g, (c) => c + c)}`;
  return null;
}

const normalizeEmail = (value: string) => (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value) ? value.toLowerCase() : null);

async function askBasics() {
  const name = flags.name ?? (await prompt("Client / site name:", "Acme"));
  const domain = await ask("Production URL:", flags.domain, "https://example.com", normalizeUrl);
  const email = await ask("Contact email:", flags.email, "hello@example.com", normalizeEmail);
  const phone = flags.phone ?? (await prompt("Contact phone (blank to skip):", ""));
  const color = await ask("Brand colour (hex):", flags.color, "#4f46e5", normalizeColor);
  return { name, domain, email, phone, color };
}

function applyBasics({ name, domain, email, phone, color }: Awaited<ReturnType<typeof askBasics>>) {
  const escaped = name.replace(/"/g, '\\"');
  patch("site.config.ts", /name: "[^"]*",\n  url:/, `name: "${escaped}",\n  url:`, "site name");
  patch("site.config.ts", /url: "[^"]*"/, `url: "${domain}"`, "site URL");
  patch("site.config.ts", /titleTemplate: "[^"]*"/, `titleTemplate: "%s | ${escaped}"`, "title template");
  patch("site.config.ts", /legalName: "[^"]*"/, `legalName: "${escaped}"`, "legal name");
  patch("site.config.ts", /email: "[^"]*"/, `email: "${email}"`, "contact email");
  if (phone) patch("site.config.ts", /phone: "[^"]*"/, `phone: "${phone}"`, "contact phone");
  patch("site.config.ts", /themeColor: "[^"]*"/, `themeColor: "${color}"`, "theme colour");
  patch("src/styles/theme.css", /--color-primary: [^;]+;/, `--color-primary: ${color};`, "brand colour");
  record(`Brand: ${name} · ${domain} · ${color}`);
}

/** Keeps only the chosen locales: config, dictionaries, font subsets and content files. */
async function applyLocales() {
  const available = ["el", "en"];
  const chosen = (flags.locales ?? (await prompt("Languages (comma-separated, first is the default):", "el,en")))
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  const unknown = chosen.filter((locale) => !available.includes(locale));
  if (unknown.length) {
    warn(`Unknown locale(s): ${unknown.join(", ")}. The template ships el and en; add more by hand.`);
    return;
  }
  if (chosen.length === 0) return warn("No locales chosen; keeping el and en.");
  const removed = available.filter((locale) => !chosen.includes(locale));
  const [defaultLocale] = chosen;

  patch(
    "site.config.ts",
    /export const locales = \[[^\]]*\] as const;/,
    `export const locales = [${chosen.map((l) => `"${l}"`).join(", ")}] as const;`,
    "locales",
  );
  patch("site.config.ts", /defaultLocale: "[^"]*"/, `defaultLocale: "${defaultLocale}"`, "default locale");

  if (removed.length) {
    // Dictionaries, region codes and font subsets are keyed by locale.
    let i18n = read("src/i18n/index.ts");
    for (const locale of removed) {
      // site.config.ts keeps per-locale copy (description, …) in Record<Locale, string>s.
      write("site.config.ts", dropLocale(read("site.config.ts"), locale));
      i18n = dropLocale(i18n, locale)
        .replace(new RegExp(`import ${locale} from "\\./locales/${locale}";\\n`), "")
        .replace(new RegExp(`\\s*${locale}: "[^"]*",`), "")
        .replace(new RegExp(`\\s*${locale}: \\[[^\\]]*\\],`), "");
      rmSync(file("src/i18n/locales", locale), { recursive: true, force: true });
      rmSync(file("src/content/legal", locale), { recursive: true, force: true });
      for (const module of listAvailableModules(ROOT)) {
        rmSync(file("src/modules", module, "i18n", `${locale}.json`), { force: true });
        const index = path.join("src/modules", module, "index.ts");
        if (existsSync(file(index))) {
          write(
            index,
            dropLocale(read(index), locale)
              .replace(new RegExp(`import ${locale} from "\\./i18n/${locale}\\.json";\\n`), "")
              .replace(new RegExp(`\\s*${locale}: ${locale}(\\.[\\w.]+)?,`), ""),
          );
        }
      }
    }
    write("src/i18n/index.ts", i18n);
    if (!chosen.includes("el")) {
      patch("astro.config.ts", /subsets: \[[^\]]*\]/, `subsets: ["latin"]`, "font subsets");
    }
    record(`Languages: ${chosen.join(", ")} (removed ${removed.join(", ")})`);
    notes.push("  Removing a language touches several files — run `npm run check` and skim the diff.");
  } else {
    record(`Languages: ${chosen.join(", ")}`);
  }
  return chosen;
}

async function applyModules() {
  const available = listAvailableModules(ROOT).filter((name) => name !== "example");
  const chosen = (flags.modules ?? (await prompt(`Modules to enable (${available.join(", ")}):`, "leads")))
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const unknown = chosen.filter((name) => !available.includes(name));
  if (unknown.length) warn(`Unknown module(s) ignored: ${unknown.join(", ")}`);

  // blog and catalog need media; enabling one without it fails the build.
  const enabled = new Set(chosen.filter((name) => available.includes(name)));
  for (const name of [...enabled]) {
    const manifest = JSON.parse(read(`src/modules/${name}/module.json`)) as { dependsOn?: string[] };
    for (const dependency of manifest.dependsOn ?? []) {
      if (!enabled.has(dependency)) {
        enabled.add(dependency);
        notes.push(`  Enabled "${dependency}" as well (${name} depends on it).`);
      }
    }
  }

  let config = read("modules.config.ts");
  for (const name of listAvailableModules(ROOT)) {
    const key = /^[A-Za-z_$][\w$]*$/.test(name) ? name : JSON.stringify(name);
    const line = new RegExp(`^(\\s*)"?${name}"?: (?:true|false),$`, "m");
    if (line.test(config)) config = config.replace(line, `$1${key}: ${enabled.has(name)},`);
    else warn(`"${name}" is not listed in modules.config.ts.`);
  }
  write("modules.config.ts", config);
  record(`Modules: ${[...enabled].join(", ") || "none"}`);
  return enabled;
}

function applyTextReplacements(name: string, email: string, domain: string) {
  // The demo copy says "Acme" everywhere; swap in the client's name.
  const targets = [
    ...globJson("src/i18n/locales"),
    ...globFiles("src/content/legal", ".md"),
    "src/modules/example/i18n/el.json",
    "src/modules/example/i18n/en.json",
  ].filter((relative) => existsSync(file(relative)));
  const host = domain.replace(/^https?:\/\//, "");
  let count = 0;
  for (const relative of targets) {
    const original = read(relative);
    const updated = original
      .replace(/Acme Ltd/g, name)
      .replace(/Acme/g, name)
      .replace(/hello@example\.com/g, email)
      .replace(/www\.example\.com|example\.com/g, host);
    if (updated !== original) {
      write(relative, updated);
      count += 1;
    }
  }
  if (count) record(`Replaced demo copy placeholders in ${count} files`);
}

function globJson(dir: string): string[] {
  return globFiles(dir, ".json");
}

function globFiles(dir: string, extension: string): string[] {
  const base = file(dir);
  if (!existsSync(base)) return [];
  return readdirSync(base, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(extension))
    .map((entry) => path.relative(ROOT, path.join(entry.parentPath, entry.name)));
}

function applyEnv(domain: string) {
  if (!existsSync(file(".env"))) copyFileSync(file(".env.example"), file(".env"));
  const env = read(".env").replace(/^SITE_URL=.*$/m, `SITE_URL=${domain}`);
  write(".env", env);
  record(".env created/updated (SITE_URL)");
}

function runBrandAssets() {
  try {
    execFileSync("npx", ["tsx", "scripts/brand-assets.mjs"], { stdio: "pipe" });
    record("Brand assets regenerated (favicons, icons, OG image)");
  } catch {
    warn("Could not regenerate brand assets — run `npm run brand:assets` after replacing public/favicon.svg.");
  }
}

/** Keeps the template reachable as a remote so `module:add` can restore modules. */
async function fixGitRemotes() {
  let remotes = "";
  try {
    remotes = execFileSync("git", ["remote", "-v"], { encoding: "utf8" });
  } catch {
    return;
  }
  const origin = /^origin\s+(\S+)/m.exec(remotes)?.[1];
  const hasTemplate = /^template\s/m.test(remotes);
  if (origin && !hasTemplate && /landing-template/.test(origin)) {
    try {
      execFileSync("git", ["remote", "rename", "origin", "template"], { stdio: "pipe" });
      record(`Renamed remote origin → template (${origin})`);
    } catch {
      warn("Could not rename the git remote; do it by hand: git remote rename origin template");
    }
  }
  const newOrigin = flags.origin ?? (await prompt("Git URL for the client repo (blank to skip):", ""));
  if (newOrigin) {
    try {
      execFileSync("git", ["remote", "add", "origin", newOrigin], { stdio: "pipe" });
      record(`Added remote origin → ${newOrigin}`);
    } catch {
      warn(`Could not add origin ${newOrigin} — it may already exist.`);
    }
  }
}

async function createAdmin(enabled: Set<string>): Promise<void> {
  const needsAdmin = [...enabled].some((name) => {
    const manifest = JSON.parse(read(`src/modules/${name}/module.json`)) as { admin?: boolean };
    return manifest.admin;
  });
  if (!needsAdmin) return;
  const email = flags["admin-email"] ?? (await prompt("Admin email (blank to skip):", ""));
  if (!email) {
    notes.push("  Create the first admin later: npm run admin:create -- --email … --name …");
    return;
  }
  const name = flags["admin-name"] ?? (await prompt("Admin name:", email.split("@")[0]!));
  // Without a terminal there's nowhere to type a password, so generate a strong one.
  const generated = process.stdin.isTTY || process.env.ADMIN_PASSWORD ? null : randomBytes(15).toString("base64url");
  try {
    execFileSync("npx", ["tsx", "scripts/admin-create.ts", "--email", email, "--name", name], {
      stdio: "inherit",
      env: generated ? { ...process.env, ADMIN_PASSWORD: generated } : process.env,
    });
    record(`Admin user created: ${email}`);
    if (generated) notes.push(`  Admin password (shown once, change it after signing in): ${generated}`);
  } catch {
    warn("Admin creation failed — run `npm run admin:create` manually.");
  }
}

// ---------------------------------------------------------------- run

console.log("Setting up a new site from landing-template.\n");
const basics = await askBasics();
applyBasics(basics);
await applyLocales();
const enabled = await applyModules();
if (await confirm("Replace 'Acme' in the demo copy with the client name?")) {
  applyTextReplacements(basics.name, basics.email, basics.domain);
}
applyEnv(basics.domain);
runBrandAssets();
await fixGitRemotes();
await createAdmin(enabled);
rl?.close();

console.log(`\n✓ Setup complete\n${changes.map((line) => `  • ${line}`).join("\n")}`);
if (notes.length) console.log(`\n${notes.join("\n")}`);
console.log(`
Next:
  1. npm run check           # types and templates
  2. npm run dev             # see the site
  3. Replace public/favicon.svg with the client logo, then npm run brand:assets
  4. Edit src/i18n/locales/*  (page copy) and src/config/navigation.ts (menu)
  5. Replace the demo images in src/assets/demo/ and the legal pages in src/content/legal/`);
