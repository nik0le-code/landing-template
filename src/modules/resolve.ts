/**
 * Resolves modules.config.ts against the folders in src/modules/. Runs in plain
 * Node (Astro integration, drizzle.config.ts, CLI) — relative imports only.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { ModuleManifest, ModulesConfig } from "./types";

export interface ResolvedModule {
  name: string;
  manifest: ModuleManifest;
  options: Record<string, unknown>;
  /** Project-relative folder, forward slashes: "src/modules/blog". */
  dir: string;
  hasActions: boolean;
  schemaFile: string | null;
}

const MODULES_DIR = "src/modules";

/** Module folders present but not listed in modules.config.ts (treated as disabled). */
export function listUnconfiguredModules(root: string, config: ModulesConfig): string[] {
  return listAvailableModules(root).filter((name) => !(name in config.modules));
}

/**
 * Schema files of ALL available modules, enabled or not. Migrations therefore
 * never change when a module is toggled — enabling needs no database step and
 * disabling can never drop a module's data.
 */
export function listAllSchemaFiles(root: string): string[] {
  return listAvailableModules(root)
    .map((name) => `${MODULES_DIR}/${name}/db/schema.ts`)
    .filter((file) => existsSync(path.join(root, file)));
}

/** Table names declared in a module's schema file (`sqliteTable("x", …)`). */
export function moduleTables(root: string, name: string): string[] {
  const file = path.join(root, MODULES_DIR, name, "db", "schema.ts");
  if (!existsSync(file)) return [];
  return [...readFileSync(file, "utf8").matchAll(/sqliteTable\(\s*["'`]([\w-]+)["'`]/g)].map((match) => match[1]!);
}

/** Tables present in the latest drizzle snapshot (i.e. covered by a migration). */
export function migratedTables(root: string): Set<string> | null {
  const metaDir = path.join(root, "drizzle", "meta");
  if (!existsSync(metaDir)) return null;
  const snapshots = readdirSync(metaDir).filter((file) => file.endsWith("_snapshot.json")).sort();
  const latest = snapshots.at(-1);
  if (!latest) return null;
  const snapshot = JSON.parse(readFileSync(path.join(metaDir, latest), "utf8")) as { tables?: Record<string, unknown> };
  return new Set(Object.keys(snapshot.tables ?? {}));
}

/** Every module folder (one containing module.json), enabled or not. */
export function listAvailableModules(root: string): string[] {
  const base = path.join(root, MODULES_DIR);
  return readdirSync(base, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(path.join(base, entry.name, "module.json")))
    .map((entry) => entry.name)
    .sort();
}

function readManifest(root: string, name: string): ModuleManifest {
  const file = path.join(root, MODULES_DIR, name, "module.json");
  const manifest = JSON.parse(readFileSync(file, "utf8")) as ModuleManifest;
  if (manifest.name !== name) {
    throw new Error(`[modules] ${MODULES_DIR}/${name}/module.json has name "${manifest.name}"; it must match the folder name.`);
  }
  return manifest;
}

/**
 * Enabled modules in a stable order (dependencies first), validated:
 * unknown names and missing dependencies fail loudly instead of half-working.
 */
export function resolveModules(root: string, config: ModulesConfig): ResolvedModule[] {
  const available = new Set(listAvailableModules(root));

  const enabled = Object.entries(config.modules).flatMap(([name, on]) => {
    if (!on) return [];
    if (!available.has(name)) {
      throw new Error(
        `[modules] "${name}" is enabled in modules.config.ts but ${MODULES_DIR}/${name}/module.json does not exist. ` +
          `Available: ${[...available].join(", ") || "none"}.`,
      );
    }
    const options = ((config.options as Record<string, Record<string, unknown>> | undefined)?.[name] ?? {}) as Record<string, unknown>;
    return [{ name, options }];
  });

  const enabledNames = new Set(enabled.map((m) => m.name));
  const resolved = new Map<string, ResolvedModule>();

  for (const { name, options } of enabled) {
    const manifest = readManifest(root, name);
    for (const dependency of manifest.dependsOn ?? []) {
      if (!enabledNames.has(dependency)) {
        throw new Error(`[modules] "${name}" depends on "${dependency}", which is not enabled in modules.config.ts.`);
      }
    }
    const dir = `${MODULES_DIR}/${name}`;
    const schemaPath = `${dir}/db/schema.ts`;
    resolved.set(name, {
      name,
      manifest,
      options,
      dir,
      hasActions: existsSync(path.join(root, dir, "actions.ts")),
      schemaFile: existsSync(path.join(root, schemaPath)) ? schemaPath : null,
    });
  }

  // Topological order so a module's dependencies register first.
  const ordered: ResolvedModule[] = [];
  const visit = (name: string, trail: string[] = []) => {
    if (ordered.some((m) => m.name === name)) return;
    if (trail.includes(name)) throw new Error(`[modules] Circular dependency: ${[...trail, name].join(" → ")}`);
    const module = resolved.get(name)!;
    for (const dependency of module.manifest.dependsOn ?? []) visit(dependency, [...trail, name]);
    ordered.push(module);
  };
  for (const name of [...resolved.keys()].sort()) visit(name);
  return ordered;
}

/** CSP sources contributed by enabled modules (`csp` in module.json), per directive. */
export function moduleCspSources(root: string, config: ModulesConfig, env: Record<string, string | undefined> = process.env): Record<string, string[]> {
  const sources: Record<string, string[]> = {};
  for (const module of resolveModules(root, config)) {
    for (const [directive, values] of Object.entries(module.manifest.csp ?? {})) {
      const resolved = values.flatMap((value) => {
        const name = /^\{env:(\w+)\}$/.exec(value)?.[1];
        if (!name) return [value];
        try {
          return env[name] ? [new URL(env[name]!).origin] : [];
        } catch {
          return [];
        }
      });
      sources[directive] = [...new Set([...(sources[directive] ?? []), ...resolved])];
    }
  }
  return sources;
}
