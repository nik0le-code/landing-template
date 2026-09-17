/** WordPress REST API client (public, read-only): timeout, retries, pagination headers. */
import { wordpressConfig } from "./config";

export class WordPressError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "WordPressError";
  }
}

type Query = Record<string, string | number | boolean | undefined | (string | number)[]>;

const TIMEOUT_MS = 10_000;
const RETRIES = 2;

export async function wpGet<T>(path: string, query: Query = {}): Promise<{ data: T; total: number; totalPages: number }> {
  const config = wordpressConfig();
  if (!config) throw new WordPressError("WordPress is not configured: set WORDPRESS_URL.", 503);

  const url = new URL(`${config.restApi}${path}`);
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) value.forEach((item) => url.searchParams.append(`${key}[]`, String(item)));
    else url.searchParams.set(key, String(value));
  }

  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(TIMEOUT_MS) });
      if ((response.status === 429 || response.status >= 500) && attempt < RETRIES) throw new WordPressError(`HTTP ${response.status}`, response.status);
      if (!response.ok) {
        // Out-of-range pages are a 400 in WordPress; callers treat them as "nothing".
        const body = (await response.json().catch(() => ({}))) as { message?: string };
        throw new WordPressError(body.message ?? `WordPress HTTP ${response.status}`, response.status);
      }
      return {
        data: (await response.json()) as T,
        total: Number(response.headers.get("X-WP-Total") ?? 0),
        totalPages: Number(response.headers.get("X-WP-TotalPages") ?? 1),
      };
    } catch (error) {
      const retryable = !(error instanceof WordPressError) || error.status === 429 || error.status >= 500;
      if (retryable && attempt < RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, 400 * 2 ** attempt));
        continue;
      }
      if (error instanceof WordPressError) throw error;
      throw new WordPressError(`WordPress request failed: ${error instanceof Error ? error.message : String(error)}`, 503);
    }
  }
}
