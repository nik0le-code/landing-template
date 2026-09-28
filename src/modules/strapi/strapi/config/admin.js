module.exports = ({ env }) => ({
  auth: { secret: env("ADMIN_JWT_SECRET") },
  apiToken: { salt: env("API_TOKEN_SALT") },
  transfer: { token: { salt: env("TRANSFER_TOKEN_SALT") } },
  secrets: { encryptionKey: env("ENCRYPTION_KEY") },
  // No surveys, enterprise promotions or remote documentation links in the admin.
  flags: { nps: false, promoteEE: false, docLinks: false },
  autoOpen: false,
  watchIgnoreFiles: ["**/site-pages.json"],
});
