import type { APIRoute } from "astro";
import { siteConfig } from "@site-config";

export const GET: APIRoute = () =>
  Response.json(
    {
      name: siteConfig.name,
      short_name: siteConfig.name,
      start_url: `/${siteConfig.defaultLocale}`,
      display: "browser",
      theme_color: siteConfig.themeColor,
      background_color: "#ffffff",
      icons: [
        { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      ],
    },
    { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=86400" } },
  );
