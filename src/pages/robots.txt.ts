import type { APIRoute } from "astro";
import { absoluteUrl, isNoindexDeployment } from "@/lib/site";

export const GET: APIRoute = () => {
  const body = isNoindexDeployment()
    ? "User-agent: *\nDisallow: /\n"
    : ["User-agent: *", "Allow: /", "Disallow: /admin", "Disallow: /api/", "", `Sitemap: ${absoluteUrl("/sitemap.xml")}`, ""].join("\n");

  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
};
