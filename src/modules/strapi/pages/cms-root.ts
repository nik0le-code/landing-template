/** /cms opens the admin (the rest of /cms is pages/cms.ts). */
import type { APIRoute } from "astro";

export const prerender = false;

export const GET: APIRoute = ({ redirect }) => redirect("/cms/admin", 302);
