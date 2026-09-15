/**
 * Fixed-window limiter for login attempts, in memory per process. With several
 * replicas each keeps its own window, which still bounds brute force per pod.
 * Keys combine IP and email so one attacker can't lock a user out globally for long.
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
