/** /admin opens Strapi's admin, while the site has no admin area of its own (`unlessAdmin`). */
import type { APIRoute } from "astro";

export const prerender = false;

export const GET: APIRoute = ({ redirect }) => redirect("/cms/admin", 302);
