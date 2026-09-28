/** Strapi content API client (read-only token): timeout, retries, bracket query strings. */
import { strapiConfig } from "./config";

export class StrapiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "StrapiError";
  }
}

/** Nested query values, encoded the way Strapi reads them: populate[seo][populate][image]=true. */
export type Query = { [key: string]: string | number | boolean | undefined | Query | (string | number)[] };

function encode(params: URLSearchParams, value: Query[string], prefix: string) {
  if (value === undefined) return;
  if (Array.isArray(value)) value.forEach((item, index) => params.append(`${prefix}[${index}]`, String(item)));
  else if (typeof value === "object") for (const [key, item] of Object.entries(value)) encode(params, item, `${prefix}[${key}]`);
  else params.append(prefix, String(value));
}

export interface Pagination {
  page: number;
  pageSize: number;
  pageCount: number;
  total: number;
}

const TIMEOUT_MS = 10_000;
const RETRIES = 2;

/** GET /api/<path>; null on 404 (a single type nobody has filled in yet). */
export async function strapiGet<T>(path: string, query: Query = {}): Promise<{ data: T; pagination: Pagination } | null> {
  const config = strapiConfig();
  if (!config) throw new StrapiError("Strapi is not configured: set STRAPI_URL.", 503);

  const url = new URL(`${config.url}/api${path}`);
  for (const [key, value] of Object.entries(query)) encode(url.searchParams, value, key);
  const headers: Record<string, string> = { Accept: "application/json" };
  if (config.token) headers.Authorization = `Bearer ${config.token}`;

  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (response.status === 404) return null;
      if ((response.status === 429 || response.status >= 500) && attempt < RETRIES) throw new StrapiError(`HTTP ${response.status}`, response.status);
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
        throw new StrapiError(`Strapi HTTP ${response.status}: ${body.error?.message ?? response.statusText}`, response.status);
      }
      const body = (await response.json()) as { data: T; meta?: { pagination?: Pagination } };
      return { data: body.data, pagination: body.meta?.pagination ?? { page: 1, pageSize: 0, pageCount: 1, total: 0 } };
    } catch (error) {
      const retryable = !(error instanceof StrapiError) || error.status === 429 || error.status >= 500;
      if (retryable && attempt < RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, 400 * 2 ** attempt));
        continue;
      }
      if (error instanceof StrapiError) throw error;
      throw new StrapiError(`Strapi request failed: ${error instanceof Error ? error.message : String(error)}`, 503);
    }
  }
}

/** URL of an upload: /uploads/… on the site itself, or on STRAPI_MEDIA_URL (a CDN, an S3 provider's absolute URLs pass through). */
export function mediaUrl(url: string): string {
  if (/^https?:\/\//.test(url)) return url;
  return `${strapiConfig()?.mediaUrl ?? ""}${url}`;
}
