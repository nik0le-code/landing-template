import type { APIRoute } from "astro";
import { loadDatabase } from "@/modules/.generated/features";

/**
 * Readiness probe: the database is reachable and migrated (when any module needs
 * one). Use this for readinessProbe and /api/health for livenessProbe.
 */
export const GET: APIRoute = async () => {
  if (!loadDatabase) return Response.json({ status: "ready", database: "not used" }, { headers: { "Cache-Control": "no-store" } });
  try {
    const { ensureMigrated } = await loadDatabase();
    await ensureMigrated();
    return Response.json({ status: "ready", database: "ok" }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[ready] database check failed", error);
    return Response.json({ status: "error", database: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
};
