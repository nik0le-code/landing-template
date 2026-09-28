// Read-only; the site reads with a read-only API token (STRAPI_TOKEN).
const { factories } = require("@strapi/strapi");

module.exports = factories.createCoreRouter("api::category.category", { only: ["find", "findOne"] });
