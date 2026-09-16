#!/usr/bin/env node
/**
 * Module CLI.
 *
 *   npm run module:list
 *   npm run module:new -- case-studies [--base-path case-studies] [--no-admin]
 *   npm run module:remove -- bookings [--force]
 *   npm run module:add -- bookings [--from ../landing-template]
 *
 * modules.config.ts stays the source of truth: these commands edit that file and
 * the src/modules folder, nothing else.
 */
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";
import { listAvailableModules } from "../src/modules/resolve";
import type { ModuleManifest } from "../src/modules/types";
import { moduleFiles } from "./module-templates";

const ROOT = process.cwd();
const CONFIG = path.join(ROOT, "modules.config.ts");
const MODULES_DIR = path.join(ROOT, "src", "modules");

const { positionals, values: flags } = parseArgs({
  allowPositionals: true,
  options: {
    "base-path": { type: "string" },
    from: { type: "string" },
    force: { type: "boolean", default: false },
    "no-admin": { type: "boolean", default: false },
  },
});
const [command, moduleName] = positionals;

const fail = (message: string): never => {
  console.error(`✗ ${message}`);
  process.exit(1);
};
const done = (message: string) => console.log(`✓ ${message}`);
const manifestOf = (name: string): ModuleManifest =>
  JSON.parse(readFileSync(path.join(MODULES_DIR, name, "module.json"), "utf8")) as ModuleManifest;

/** modules.config.ts is read as text so comments and formatting survive edits. */
function readConfigText() {
  return readFileSync(CONFIG, "utf8");
}

function configuredModules(text: string): Record<string, boolean> {
  const block = /modules:\s*\{([\s\S]*?)\n\s*\},/.exec(text);
  if (!block) fail("Could not find the `modules: { … }` block in modules.config.ts.");
  return Object.fromEntries(
    [...block![1]!.matchAll(/^\s*"?([\w-]+)"?\s*:\s*(true|false)\s*,/gm)].map((match) => [match[1]!, match[2] === "true"]),
  );
}

/** Object keys with a hyphen must be quoted in TypeScript. */
const configKey = (name: string) => (/^[A-Za-z_$][\w$]*$/.test(name) ? name : JSON.stringify(name));

function setModuleFlag(name: string, enabled: boolean | null) {
  let text = readConfigText();
  const line = new RegExp(`^\\s*"?${name}"?\\s*:\\s*(?:true|false)\\s*,\\s*\\n`, "m");
  if (enabled === null) {
    if (!line.test(text)) return;
    text = text.replace(line, "");
  } else if (line.test(text)) {
    text = text.replace(line, `    ${configKey(name)}: ${enabled},\n`);
  } else {
    // Insert alphabetically inside the modules block.
    const block = /(modules:\s*\{\n)([\s\S]*?)(\n\s*\},)/.exec(text);
    if (!block) fail("Could not find the `modules: { … }` block in modules.config.ts.");
    const lines = block![2]!.split("\n").filter(Boolean);
    const entry = `    ${configKey(name)}: ${enabled},`;
    const index = lines.findIndex((existing) => (existing.trim().replace(/"/g, "").split(":")[0] ?? "") > name);
    lines.splice(index === -1 ? lines.length : index, 0, entry);
    text = text.replace(block![0]!, `${block![1]}${lines.join("\n")}${block![3]}`);
  }
  writeFileSync(CONFIG, text);
}

async function confirm(question: string) {
  if (flags.force) return true;
  if (!process.stdin.isTTY) fail("Not a TTY: pass --force to confirm.");
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question(`${question} [y/N] `)).trim().toLowerCase();
  rl.close();
  return answer === "y" || answer === "yes";
}

function list() {
  const text = readConfigText();
  const configured = configuredModules(text);
  const available = listAvailableModules(ROOT);
  const rows = available.map((name) => {
    const manifest = manifestOf(name);
    return {
      module: name,
      enabled: configured[name] ? "on" : name in configured ? "off" : "MISSING",
      admin: manifest.admin ? "yes" : "",
      needs: (manifest.dependsOn ?? []).join(", "),
      tables: existsSync(path.join(MODULES_DIR, name, "db", "schema.ts")) ? "yes" : "",
      routes: String(manifest.routes?.length ?? 0),
    };
  });
  console.table(rows, ["module", "enabled", "admin", "needs", "tables", "routes"]);
  const unlisted = available.filter((name) => !(name in configured));
  if (unlisted.length) console.log(`! Not listed in modules.config.ts (treated as off): ${unlisted.join(", ")}`);
  const unknown = Object.keys(configured).filter((name) => !available.includes(name));
  if (unknown.length) console.log(`! In modules.config.ts but no folder: ${unknown.join(", ")}`);
  console.log("\nEdit modules.config.ts to turn modules on or off.");
}

function scaffold(name: string) {
  if (!/^[a-z][a-z0-9-]{1,30}$/.test(name)) fail("Name must be lowercase kebab-case, e.g. case-studies.");
  const dir = path.join(MODULES_DIR, name);
  if (existsSync(dir)) fail(`src/modules/${name} already exists.`);

  const camel = name.replace(/-([a-z0-9])/g, (_, char: string) => char.toUpperCase());
  const files = moduleFiles({
    name,
    basePath: flags["base-path"] ?? name,
    camel,
    snake: name.replace(/-/g, "_"),
    label: name.charAt(0).toUpperCase() + name.slice(1).replace(/-/g, " "),
  });

  for (const [file, contents] of Object.entries(files)) {
    if (flags["no-admin"] && (file.startsWith("pages/admin") || file === "actions.ts")) continue;
    const target = path.join(dir, file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, contents);
  }
  if (flags["no-admin"]) {
    const manifestPath = path.join(dir, "module.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as ModuleManifest;
    manifest.admin = false;
    manifest.routes = (manifest.routes ?? []).filter((route) => !route.pattern.startsWith("/admin"));
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  }

  setModuleFlag(name, true);
  done(`Created src/modules/${name} and enabled it in modules.config.ts`);
  console.log(`
Next:
  1. npm run db:generate     # migration for the ${name.replace(/-/g, "_")}_items table
  2. npm run dev             # /<lang>/${flags["base-path"] ?? name}${flags["no-admin"] ? "" : ` and /admin/${name}`}
  3. Edit module.json (description), i18n/*.json (labels) and db/schema.ts (fields).`);
}

async function remove(name: string) {
  const dir = path.join(MODULES_DIR, name);
  if (!existsSync(dir)) fail(`src/modules/${name} does not exist.`);
  const hasTables = existsSync(path.join(dir, "db", "schema.ts"));
  console.log(`This deletes src/modules/${name} and removes it from modules.config.ts.`);
  if (hasTables) {
    console.log(
      `! Its database tables stay in place, but the NEXT \`npm run db:generate\` will create a migration that DROPS them.\n` +
        `  To keep the data, set \`${name}: false\` in modules.config.ts instead of deleting the folder.`,
    );
  }
  if (!(await confirm(`Delete src/modules/${name}?`))) return console.log("Cancelled.");
  rmSync(dir, { recursive: true, force: true });
  setModuleFlag(name, null);
  done(`Removed ${name}.`);
  if (hasTables) {
    console.log(
      "  Run `npm run db:generate` in a terminal when you're ready to drop its tables.\n" +
        "  If drizzle-kit asks whether a table was renamed (it can't tell a drop+create apart),\n" +
        "  choose 'create table' / 'drop table' — never the rename option.",
    );
  }
}

function add(name: string) {
  const target = path.join(MODULES_DIR, name);
  if (existsSync(target)) fail(`src/modules/${name} already exists.`);

  if (flags.from) {
    const source = path.resolve(flags.from, "src/modules", name);
    if (!existsSync(source)) fail(`${source} not found.`);
    cpSync(source, target, { recursive: true });
  } else {
    // Restore from a git remote that tracks the template (default: "template").
    const remote = process.env.TEMPLATE_REMOTE ?? "template";
    const ref = process.env.TEMPLATE_REF ?? `${remote}/main`;
    try {
      execFileSync("git", ["fetch", remote], { stdio: "ignore" });
      execFileSync("git", ["checkout", ref, "--", `src/modules/${name}`], { stdio: "inherit" });
    } catch {
      fail(
        `Could not restore from git ref "${ref}".\n` +
          `  Add the template remote once:  git remote add ${remote} <template repo url>\n` +
          `  …or copy from a local checkout: npm run module:add -- ${name} --from ../landing-template`,
      );
    }
  }
  if (!existsSync(path.join(target, "module.json"))) fail(`Restored folder has no module.json.`);
  setModuleFlag(name, true);
  done(`Added ${name} and enabled it in modules.config.ts`);
  console.log("Next: npm run db:generate (if it has tables), then npm run dev");
}

switch (command) {
  case "list":
    list();
    break;
  case "new":
    scaffold(moduleName ?? fail("Usage: npm run module:new -- <name>"));
    break;
  case "remove":
    await remove(moduleName ?? fail("Usage: npm run module:remove -- <name>"));
    break;
  case "add":
    add(moduleName ?? fail("Usage: npm run module:add -- <name>"));
    break;
  default:
    console.log(`Usage:
  npm run module:list
  npm run module:new -- <name> [--base-path <url-segment>] [--no-admin]
  npm run module:remove -- <name> [--force]
  npm run module:add -- <name> [--from ../landing-template]`);
    process.exit(command ? 1 : 0);
}
