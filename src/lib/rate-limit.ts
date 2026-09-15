/**
 * Fixed-window rate limiter, in memory per process (login attempts, form
 * submissions). With several replicas each pod keeps its own windows, which
 * still bounds abuse per pod. Prefix keys by feature: `login:…`, `leads:…`.
 */
interface Window {
  count: number;
  resetAt: number;
}

const windows = new Map<string, Window>();

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

export function consume(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  if (windows.size > 10_000) {
    for (const [k, w] of windows) if (w.resetAt <= now) windows.delete(k);
  }
  const current = windows.get(key);
  const window = current && current.resetAt > now ? current : { count: 0, resetAt: now + windowMs };
  window.count += 1;
  windows.set(key, window);
  return {
    allowed: window.count <= limit,
    retryAfterSeconds: Math.max(0, Math.ceil((window.resetAt - now) / 1000)),
  };
}

export function reset(key: string) {
  windows.delete(key);
}
