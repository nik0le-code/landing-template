import type { APIRoute } from "astro";

/** Liveness probe: the process is up. No database access, always cheap. */
export const GET: APIRoute = () =>
  Response.json({ status: "ok", uptime: Math.round(process.uptime()) }, { headers: { "Cache-Control": "no-store" } });
