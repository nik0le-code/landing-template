/**
 * Store API client. The visitor's cart is identified by the `Cart-Token` header
 * (a signed token WooCommerce issues); requests carrying it need no nonce.
 * Reads retry on 429/5xx; writes never retry, so an item is never added twice.
 */
import { wooConfig } from "./config";

export class WooError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    /** The (possibly renewed) cart token, when the response carried one. */
    readonly token: string | null = null,
  ) {
    super(message);
    this.name = "WooError";
  }
}

export interface StoreRequest {
  method?: "GET" | "POST";
  query?: URLSearchParams | Record<string, string | number | undefined>;
  body?: unknown;
  token?: string | null;
  clientAddress?: string;
}

const TIMEOUT_MS = 10_000;
const RETRIES = 2;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface StoreResponse<T> {
  data: T;
  token: string | null;
  headers: Headers;
}

export async function store<T>(path: string, { method = "GET", query, body, token, clientAddress }: StoreRequest = {}): Promise<StoreResponse<T>> {
  const config = wooConfig();
  if (!config) throw new WooError("WooCommerce is not configured: set WOOCOMMERCE_URL.", 503, "not_configured");

  const url = new URL(`${config.storeApi}${path}`);
  const params = query instanceof URLSearchParams ? query : new URLSearchParams(Object.entries(query ?? {}).flatMap(([k, v]) => (v === undefined ? [] : [[k, String(v)]])));
  params.forEach((value, key) => url.searchParams.append(key, value));

  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers["Cart-Token"] = token;
  if (clientAddress) headers["X-Forwarded-For"] = clientAddress;

  for (let attempt = 0; ; attempt++) {
    let response: Response;
    try {
      response = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (error) {
      if (method === "GET" && attempt < RETRIES) {
        await sleep(400 * 2 ** attempt);
        continue;
      }
      throw new WooError(`WooCommerce request failed: ${error instanceof Error ? error.message : String(error)}`, 503, "network");
    }
    if (method === "GET" && (response.status === 429 || response.status >= 500) && attempt < RETRIES) {
      await sleep(400 * 2 ** attempt);
      continue;
    }

    const nextToken = response.headers.get("Cart-Token") ?? token ?? null;
    const text = await response.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      throw new WooError(`WooCommerce returned non-JSON (HTTP ${response.status}). Is ${config.storeApi} the Store API?`, 502, "invalid_response", nextToken);
    }
    if (!response.ok) {
      const error = (json ?? {}) as { code?: string; message?: string };
      throw new WooError(error.message ?? `WooCommerce HTTP ${response.status}`, response.status, error.code ?? "http_error", nextToken);
    }
    return { data: json as T, token: nextToken, headers: response.headers };
  }
}
