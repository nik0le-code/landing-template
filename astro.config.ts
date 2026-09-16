import { defineConfig, envField, fontProviders, memoryCache } from "astro/config";
import node from "@astrojs/node";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import { siteConfig } from "./site.config";
import modulesConfig from "./modules.config";
import { modulesIntegration } from "./src/integrations/modules";

export default defineConfig({
  site: process.env.SITE_URL ?? siteConfig.url,
  output: "server",
  trailingSlash: "never",
  // "middleware" + server.mjs: one place for security headers, compression and
  // long-lived cache headers, applied to static files as well as rendered pages.
  adapter: node({ mode: "middleware" }),
  integrations: [react(), modulesIntegration(modulesConfig)],
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

  markdown: {
    // Shiki emits inline styles, which the CSP blocks. Code blocks in legal pages
    // and blog posts are styled by src/styles/prose.css instead.
    syntaxHighlight: false,
  },

  image: {
    responsiveStyles: true,
  },

  security: {
    checkOrigin: true,
    /**
     * Content-Security-Policy. Astro adds hashes for its own inline scripts/styles;
     * Google tag + Analytics hosts are listed because the consent banner may load
     * them at runtime. Remove those two lines for sites without tracking.
     */
    csp: {
      directives: [
        "default-src 'self'",
        "base-uri 'self'",
        "object-src 'none'",
        "frame-ancestors 'self'",
        "form-action 'self'",
        "img-src 'self' data: https://www.googletagmanager.com https://www.google-analytics.com",
        "font-src 'self'",
        "connect-src 'self' https://www.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com",
        "frame-src 'self' https://www.google.com https://www.youtube-nocookie.com",
      ],
      // Astro adds hashes for its own inline scripts/styles to these.
      scriptDirective: { resources: ["'self'", "https://www.googletagmanager.com"] },
      styleDirective: { resources: ["'self'"] },
    },
    // Behind a reverse proxy/ingress, trust X-Forwarded-Host/Proto/For only for the
    // site's own host (needed for correct origin checks and client IPs).
    allowedDomains: [{ hostname: new URL(process.env.SITE_URL ?? siteConfig.url).hostname }],
  },

  env: {
    schema: {
      // "secret" = read at runtime, so one image can serve staging and production.
      SITE_URL: envField.string({ context: "server", access: "secret", optional: true }),
      NOINDEX: envField.boolean({ context: "server", access: "secret", default: false }),
      DATABASE_URL: envField.string({ context: "server", access: "secret", default: "file:./data/site.db" }),
      DATABASE_AUTH_TOKEN: envField.string({ context: "server", access: "secret", optional: true }),
      DB_MIGRATE_ON_START: envField.boolean({ context: "server", access: "secret", default: true }),
      UPLOADS_DIR: envField.string({ context: "server", access: "secret", default: "./data/uploads" }),
      // Enables /admin/setup (create the first owner from the browser) while no users exist. 16+ chars.
      ADMIN_SETUP_TOKEN: envField.string({ context: "server", access: "secret", optional: true }),
      RESEND_API_KEY: envField.string({ context: "server", access: "secret", optional: true }),
      EMAIL_FROM: envField.string({ context: "server", access: "secret", optional: true }),
    },
  },

  vite: {
    plugins: [tailwindcss()],
  },
});
