/**
 * Wires enabled modules (modules.config.ts) into the build:
 *
 * - injects each module's routes, plus the admin area (src/admin) when any enabled
 *   module declares `"admin": true` — sites without backend modules have no /admin;
 * - generates src/modules/.generated/{registry,actions}.ts with static imports of
 *   ENABLED modules only — the bundler never sees disabled modules;
 * - restarts the dev server when modules.config.ts or a module.json changes.
 *
 * Loaded by astro.config.ts in plain Node: relative imports only.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AstroIntegration } from "astro";
import {
  listAllSchemaFiles,
  listAvailableModules,
  listUnconfiguredModules,
  migratedTables,
  mergeOptions,
  moduleTables,
  optionValue,
  resolveModules,
  type ResolvedModule,
} from "../modules/resolve";
import type { ModulesConfig } from "../modules/types";

const GENERATED_DIR = "src/modules/.generated";
const HEADER = "// AUTO-GENERATED from modules.config.ts by src/integrations/modules.ts — do not edit.\n";

function writeIfChanged(file: string, content: string) {
  if (existsSync(file) && readFileSync(file, "utf8") === content) return;
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content);
}

const identifier = (name: string) => `module_${name.replace(/[^a-zA-Z0-9]/g, "_")}`;

const ADMIN_ROUTES = [
  { pattern: "/admin", entrypoint: "./src/admin/pages/index.astro" },
  { pattern: "/admin/login", entrypoint: "./src/admin/pages/login.astro" },
  { pattern: "/admin/setup", entrypoint: "./src/admin/pages/setup.astro" },
  { pattern: "/admin/account", entrypoint: "./src/admin/pages/account.astro" },
  { pattern: "/admin/users", entrypoint: "./src/admin/pages/users/index.astro" },
  { pattern: "/admin/users/new", entrypoint: "./src/admin/pages/users/new.astro" },
  { pattern: "/admin/users/[id]", entrypoint: "./src/admin/pages/users/[id].astro" },
  { pattern: "/admin/language/[lang]", entrypoint: "./src/admin/pages/language.ts" },
];

/**
 * Feature switches for core code (middleware). Loaders are `null` when unused, so
 * the auth and database code aren't referenced at all — and not bundled.
 */
function featuresSource(adminEnabled: boolean, databaseEnabled: boolean) {
  return (
    HEADER +
    `export const adminEnabled = ${adminEnabled};\n` +
    `export const databaseEnabled = ${databaseEnabled};\n\n` +
    `export const loadAuth: null | (() => Promise<typeof import("../../admin/auth/session")>) = ${adminEnabled ? '() => import("../../admin/auth/session")' : "null"};\n` +
    `export const loadDatabase: null | (() => Promise<typeof import("../../db")>) = ${databaseEnabled ? '() => import("../../db")' : "null"};\n`
  );
}

function registrySource(modules: ResolvedModule[], adminEnabled: boolean) {
  const imports = modules.map((m) => `import ${identifier(m.name)} from "../${m.name}/index";`).join("\n");
  const options = Object.fromEntries(modules.map((m) => [m.name, m.options]));
  return (
    HEADER +
    `import type { ModuleRuntime } from "../types";\n` +
    (imports ? `${imports}\n` : "") +
    `\nexport const adminEnabled = ${adminEnabled};\n` +
    `\nexport const enabledModules = ${JSON.stringify(modules.map((m) => m.name))} as const;\n\n` +
    `export const moduleRuntimes: ModuleRuntime[] = [${modules.map((m) => identifier(m.name)).join(", ")}];\n\n` +
    `export const moduleOptions: Record<string, Record<string, unknown>> = ${JSON.stringify(options, null, 2)};\n`
  );
}

/**
 * Real imports for enabled modules (and the admin core, when enabled) only. The `AllModuleActions` type references
 * every available module through type-only `import()` (erased at build), so a
 * disabled module's own files still type-check without being bundled.
 */
function actionsSource(modules: ResolvedModule[], available: { name: string; hasActions: boolean }[], adminEnabled: boolean) {
  const withActions = modules.filter((m) => m.hasActions);
  const imports = [
    ...(adminEnabled ? ['import { actions as core_admin } from "../../admin/actions";'] : []),
    ...withActions.map((m) => `import { actions as ${identifier(m.name)} } from "../${m.name}/actions";`),
  ].join("\n");
  const entries = [
    ...(adminEnabled ? ['  "admin": core_admin,'] : []),
    ...withActions.map((m) => `  ${JSON.stringify(m.name)}: ${identifier(m.name)},`),
  ].join("\n");
  const types = [
    '  "admin": typeof import("../../admin/actions").actions;',
    ...available.filter((m) => m.hasActions).map((m) => `  ${JSON.stringify(m.name)}: typeof import("../${m.name}/actions").actions;`),
  ].join("\n");
  return (
    HEADER +
    (imports ? `${imports}\n\n` : "") +
    `type AllModuleActions = {\n${types}\n};\n\n` +
    `export const moduleActions = {${entries ? `\n${entries}\n` : ""}} as unknown as AllModuleActions;\n`
  );
}

/** Pages whose source reads editable content (getPageContent) can't be prerendered while a CMS provides it. */
function readsPageContent(root: string, component: string) {
  try {
    return /\bgetPageContent\s*\(/.test(readFileSync(path.join(root, component), "utf8"));
  } catch {
    return false;
  }
}

export function modulesIntegration(config: ModulesConfig): AstroIntegration {
  let pageContentEnabled = false;
  let projectRoot = process.cwd();
  return {
    name: "landing-template:modules",
    hooks: {
      "astro:route:setup": ({ route, logger }) => {
        if (pageContentEnabled && route.component.endsWith(".astro") && readsPageContent(projectRoot, route.component)) {
          if (route.prerender !== false) logger.debug(`${route.component}: server-rendered (editable page content)`);
          route.prerender = false;
        }
      },
      "astro:config:setup": ({ config: astroConfig, injectRoute, addWatchFile, updateConfig, logger }) => {
        const root = fileURLToPath(astroConfig.root);
        projectRoot = root;
        // Pages switched to server rendering would warn "getStaticPaths() ignored" on every
        // request; their getStaticPaths export is dropped while page content is editable.
        updateConfig({
          vite: {
            plugins: [
              {
                name: "landing-template:editable-pages",
                enforce: "pre" as const,
                transform(code: string, id: string) {
                  const file = id.split("?")[0]!;
                  if (!pageContentEnabled || !file.startsWith(path.join(root, "src/pages")) || !file.endsWith(".astro") || !/\bgetPageContent\s*\(/.test(code)) return;
                  // Astro warns when the word appears anywhere in the page code, so the name goes too.
                  return { code: code.replace(/export\s+const\s+getStaticPaths\s*=/, "const staticPathsWhenPrerendered ="), map: null };
                },
              },
            ],
          },
        });
        const modules = resolveModules(root, config);
        pageContentEnabled = modules.some(
          (m) => m.manifest.pageContent === true || (typeof m.manifest.pageContent === "string" && Boolean(optionValue(m.manifest, m.options, m.manifest.pageContent))),
        );

        const adminEnabled = modules.some((m) => m.manifest.admin);
        const databaseEnabled = adminEnabled || modules.some((m) => m.schemaFile);
        writeIfChanged(path.join(root, GENERATED_DIR, "registry.ts"), registrySource(modules, adminEnabled));
        writeIfChanged(path.join(root, GENERATED_DIR, "features.ts"), featuresSource(adminEnabled, databaseEnabled));
        const available = listAvailableModules(root).map((name) => ({
          name,
          hasActions: existsSync(path.join(root, "src/modules", name, "actions.ts")),
        }));
        writeIfChanged(path.join(root, GENERATED_DIR, "actions.ts"), actionsSource(modules, available, adminEnabled));

        if (adminEnabled) {
          for (const route of ADMIN_ROUTES) injectRoute(route);
        }

        for (const module of modules) {
          const values = mergeOptions(module.manifest.optionDefaults ?? {}, module.options);
          for (const route of module.manifest.routes ?? []) {
            const pattern = route.pattern.replace(/\{(\w+)\}/g, (_, key: string) => {
              const value = values[key];
              if (typeof value !== "string" || !/^[a-z0-9-]+$/.test(value)) {
                throw new Error(`[modules] ${module.name}: route placeholder {${key}} needs a lowercase slug option, got ${JSON.stringify(value)}.`);
              }
              return value;
            });
            if (route.when && !optionValue(module.manifest, module.options, route.when)) continue;
            if (route.unlessAdmin && adminEnabled) continue;
            injectRoute({
              pattern,
              entrypoint: `./${module.dir}/${route.entrypoint.replace(/^\.\//, "")}`,
              ...(route.prerender !== undefined && { prerender: route.prerender }),
            });
          }
        }

        addWatchFile(path.join(root, "modules.config.ts"));
        for (const name of listAvailableModules(root)) {
          addWatchFile(path.join(root, "src/modules", name, "module.json"));
        }

        logger.info(
          (modules.length ? `enabled: ${modules.map((m) => m.name).join(", ")}` : "no modules enabled") +
            (adminEnabled ? " (admin area on)" : ""),
        );

        const unconfigured = listUnconfiguredModules(root, config);
        if (unconfigured.length) {
          logger.warn(`not listed in modules.config.ts (disabled): ${unconfigured.join(", ")} — add them as \`name: false\`.`);
        }

        // Tables an enabled module needs but no migration creates yet.
        const migrated = migratedTables(root);
        const missing = modules.flatMap((module) =>
          moduleTables(root, module.name).filter((table) => !migrated?.has(table)),
        );
        if (listAllSchemaFiles(root).length && (!migrated || missing.length)) {
          logger.warn(
            `${missing.length ? `no migration yet for: ${missing.join(", ")}` : "module tables exist but no migrations were generated"} — run \`npm run db:generate\`.`,
          );
        }
      },
    },
  };
}
