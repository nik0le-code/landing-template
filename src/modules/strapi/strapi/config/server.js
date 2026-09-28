module.exports = ({ env }) => ({
  host: env("HOST", "0.0.0.0"),
  port: env.int("PORT", 1337),
  // Public URL of this Strapi (admin links, media URLs), e.g. https://cms.client.gr
  url: env("PUBLIC_URL", ""),
  proxy: env.bool("IS_PROXIED", false),
  app: { keys: env.array("APP_KEYS") },
  // No cron, no update checks: nothing runs between requests.
  cron: { enabled: false },
  logger: { updates: { enabled: false } },
});
