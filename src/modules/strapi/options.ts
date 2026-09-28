/** `modules.config.ts` → `options: { strapi: { … } }` */

export interface StrapiOptions {
  /** Content written in Strapi, rendered with this site's design. */
  content: {
    /** Posts at /[lang]/<postsPath> (list, categories, RSS, post pages). */
    posts: boolean;
    /** Pages at /[lang]/<slug>, for paths no page in src/pages/ or module owns. */
    pages: boolean;
    /**
     * The site's own pages (home, about… in src/config/editable-pages.ts) get editable
     * copy, lists and images in Strapi; empty fields keep the code copy. Those pages
     * become server-rendered and cached while this is on.
     */
    sitePages: boolean;
  };
  /** URL segment for posts. Don't enable the blog module with the same path. */
  postsPath: string;
  postsPerPage: number;
  /** Latest posts on the home page (0 hides the section). */
  latestOnHome: number;
  /** Seconds rendered content pages are served from cache (publishing in Strapi purges it sooner). */
  cacheSeconds: number;
}

export const strapiDefaults: StrapiOptions = {
  content: { posts: true, pages: true, sitePages: true }, // keep in sync with optionDefaults in module.json
  postsPath: "blog",
  postsPerPage: 9,
  latestOnHome: 3,
  cacheSeconds: 300,
};

declare module "@/modules/types" {
  interface ModuleOptionsMap {
    strapi: StrapiOptions;
  }
}
