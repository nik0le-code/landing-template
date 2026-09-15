import { defineConfig, envField, fontProviders, memoryCache } from "astro/config";
import node from "@astrojs/node";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import { siteConfig } from "./site.config";

export default defineConfig({
  site: process.env.SITE_URL ?? siteConfig.url,
  output: "server",
  trailingSlash: "never",
  adapter: node({ mode: "standalone" }),
  integrations: [react()],
  // Admin auth uses its own DB-backed sessions; Astro sessions would write to the pod filesystem.
  session: false,

  i18n: {
    locales: [...siteConfig.locales],
    defaultLocale: siteConfig.defaultLocale,
    // Locale routing is handled by src/middleware.ts + src/pages/index.ts. Astro's
    // built-in prefix-always strategy 404s every unprefixed page (/admin, /dev/…).
    routing: "manual",
  },

  // Rendered pages are cached in memory per pod; admin mutations invalidate by tag.
  cache: {
    provider: memoryCache({ max: 2000 }),
  },

  // Internal links prefetch on hover/focus (desktop) — instant navigations without
  // eager downloads. Astro skips prefetching on Save-Data and slow connections.
  prefetch: {
    prefetchAll: true,
    defaultStrategy: "hover",
  },

  fonts: [
    {
      provider: fontProviders.fontsource(),
      name: "Inter",
      cssVariable: "--font-inter",
      weights: ["400 700"],
      styles: ["normal"],
      subsets: ["latin", "greek"],
      fallbacks: ["system-ui", "sans-serif"],
    },
  ],

  image: {
    responsiveStyles: true,
  },

  security: {
    checkOrigin: true,
  },

  env: {
    schema: {
      // "secret" = read at runtime, so one image can serve staging and production.
      SITE_URL: envField.string({ context: "server", access: "secret", optional: true }),
      NOINDEX: envField.boolean({ context: "server", access: "secret", default: false }),
      DATABASE_URL: envField.string({ context: "server", access: "secret", default: "file:./data/site.db" }),
      DATABASE_AUTH_TOKEN: envField.string({ context: "server", access: "secret", optional: true }),
      UPLOADS_DIR: envField.string({ context: "server", access: "secret", default: "./data/uploads" }),
      RESEND_API_KEY: envField.string({ context: "server", access: "secret", optional: true }),
      EMAIL_FROM: envField.string({ context: "server", access: "secret", optional: true }),
    },
  },

  vite: {
    plugins: [tailwindcss()],
  },
});
