/**
 * Modules — switch features on and off here, and nowhere else.
 *
 *   true   the module is part of the site
 *   false  it contributes nothing: no routes, admin pages, actions or JavaScript
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
    commerce: true,
    example: false,
    leads: false,
    media: false,
    settings: false,
    shopify: false,
    woocommerce: true,
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
    commerce: { basePath: "shop", cartPath: "cart", pageSize: 24, featuredCollection: "", featuredOnHome: 4, cacheSeconds: 300, countries: ["GR", "CY"], paymentMethodLabels: { mockpay: { title: { el: "Κάρτα (δοκιμαστική)", en: "Card (test gateway)" }, description: { el: "Δοκιμαστική σελίδα πληρωμής.", en: "Test payment page: choose Pay, Fail or Cancel." } } } },
    shopify: { country: "" },
    woocommerce: { paymentMethods: ["viva", "epay", "mockpay", "cod", "bacs"], filterAttributes: [], stockFilter: true },
  },
});
