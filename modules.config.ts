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
    example: false,
    media: false,
  },

  options: {
    example: { pageSize: 20 },
    media: { maxUploadMb: 15 },
  },
});
