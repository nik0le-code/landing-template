// Strapi lives under /cms on the site's own domain: the proxy in front (Traefik in the
// cluster, the site itself locally) strips the prefix, so Strapi serves at its root while
// the admin panel is built for /cms/admin. PUBLIC_URL is the site's origin.
const CMS_PATH = "/cms";

module.exports = ({ env }) => ({
  host: env("HOST", "0.0.0.0"),
  port: env.int("PORT", 1337),
  url: `${env("PUBLIC_URL", "http://localhost:3000").replace(/\/+$/, "")}${CMS_PATH}`,
  // Behind a proxy that sets X-Forwarded-* (secure admin cookies over HTTPS).
  proxy: env.bool("IS_PROXIED", true),
  app: { keys: env.array("APP_KEYS") },
  // No cron, no update checks: nothing runs between requests.
  cron: { enabled: false },
  logger: { updates: { enabled: false } },
});
