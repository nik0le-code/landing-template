module.exports = ({ env }) => ({
  // The browser sees the admin at /cms/admin (config/server.js): its session cookies have to
  // match. Also baked into the admin bundle (`strapi build`), so a change needs a rebuild.
  auth: { secret: env("ADMIN_JWT_SECRET"), cookie: { path: "/cms/admin" } },
  apiToken: { salt: env("API_TOKEN_SALT") },
  transfer: { token: { salt: env("TRANSFER_TOKEN_SALT") } },
  secrets: { encryptionKey: env("ENCRYPTION_KEY") },
  // No surveys, enterprise promotions or remote documentation links in the admin.
  flags: { nps: false, promoteEE: false, docLinks: false },
  autoOpen: false,
  watchIgnoreFiles: ["**/site-pages.json"],
});
