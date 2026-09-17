/** Resolves the enabled commerce backend (the module that `provides.commerce`). */
import { modules } from "@/modules/registry";
import type { CommerceProvider } from "./types";

let provider: Promise<CommerceProvider> | null = null;

export class CommerceError extends Error {
  constructor(
    message: string,
    readonly status = 503,
  ) {
    super(message);
    this.name = "CommerceError";
  }
}

export function getCommerce(): Promise<CommerceProvider> {
  if (provider) return provider;
  const backends = modules.filter((module) => module.provides?.commerce);
  if (backends.length !== 1) {
    const message =
      backends.length === 0
        ? "[commerce] No backend enabled: set `shopify: true` or `woocommerce: true` in modules.config.ts."
        : `[commerce] Only one backend may be enabled, found: ${backends.map((m) => m.name).join(", ")}.`;
    return Promise.reject(new CommerceError(message, 500));
  }
  provider = backends[0]!.provides!.commerce!();
  return provider;
}
