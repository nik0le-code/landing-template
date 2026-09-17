/**
 * Modules — switch features on and off here, and nowhere else.
 *
 *   true   the module is part of the site
 *   false  it contributes nothing: no routes, admin pages, actions or JavaScript
 *
 * Some modules are building blocks switched on by others' options instead of
 * listed here: `commerce` (by shopify or wordpress.shop) and `woocommerce` (by
 * wordpress.shop).
 *
 * Toggling needs no other step (the dev server restarts itself; database tables
 * for every module already exist). Options are optional and only read for
 * enabled modules.
 */
import { defineModulesConfig } from "./src/modules/define";

export default defineModulesConfig({
  modules: {
    blog: false,
    bookings: false,
    catalog: false,
    example: false,
    leads: false,
    media: false,
    settings: false,
    shopify: false,
    wordpress: true,
  },

  options: {
    blog: { postsPerPage: 9, latestOnHome: 3 },
    bookings: {
      basePath: "booking",
      services: [
        // { value: "consultation", label: { el: "Συμβουλευτική", en: "Consultation" } },
      ],
      openDays: [1, 2, 3, 4, 5],
      slots: ["09:00", "10:00", "11:00", "12:00", "16:00", "17:00", "18:00"],
      minNoticeHours: 24,
    },
    catalog: { basePath: "products", currency: "EUR", showPrices: true, featuredOnHome: 3 },
    example: { pageSize: 20 },
    leads: {
      notifyEmails: [],
      forms: {
        contact: { fields: ["name", "email", "phone", "message"], required: ["name", "email", "message"], consent: true },
        waitlist: { fields: ["email"], required: ["email"] },
      },
    },
    media: { maxUploadMb: 15 },
    shopify: { country: "" },
    wordpress: {
      shop: true, // WooCommerce storefront (commerce options below)
      content: { posts: true, pages: true },
      postsPath: "blog",
      // WordPress plugins (npm run wp:up / wp:plugins); configure them in wp-admin.
      plugins: ["viva-com-smart-for-woocommerce", "secure-card-gateway-for-epay-paycenter-piraeus-bank"],
      paymentMethods: ["viva", "epay", "cod", "bacs"],
    },
    // Storefront used by the shop (wordpress.shop or shopify).
    commerce: { basePath: "shop", cartPath: "cart", pageSize: 24, featuredCollection: "", featuredOnHome: 4, cacheSeconds: 300, countries: ["GR", "CY"] },
  },
});
