/** Public: free times for a date, used by the booking form to grey out taken slots. */
import type { APIRoute } from "astro";
import { consume } from "@/lib/rate-limit";
import { availableSlots } from "../lib/availability";

export const prerender = false;

export const GET: APIRoute = async ({ url, clientAddress }) => {
  if (!consume(`booking-slots:${clientAddress}`, 60, 60_000).allowed) return new Response(null, { status: 429 });
  const date = url.searchParams.get("date") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return Response.json({ slots: [] }, { status: 400 });
  return Response.json({ slots: await availableSlots(date) }, { headers: { "Cache-Control": "no-store" } });
};
