/**
 * Identity helpers that give module files type checking. No runtime logic and no
 * aliased imports: this file is loaded by astro.config.ts and drizzle.config.ts.
 */
import type { ModuleRuntime, ModulesConfig } from "./types";

export const defineModuleRuntime = (runtime: ModuleRuntime) => runtime;

export const defineModulesConfig = (config: ModulesConfig) => config;
