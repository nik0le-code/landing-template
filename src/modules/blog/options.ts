/** `modules.config.ts` → `options: { blog: { … } }` */
export interface BlogOptions {
  postsPerPage: number;
  /** Show the author's name on posts. */
  showAuthor: boolean;
  /** Posts listed by the home-page "latest posts" section (0 hides it). */
  latestOnHome: number;
}

export const blogDefaults: BlogOptions = {
  postsPerPage: 9,
  showAuthor: true,
  latestOnHome: 3,
};

declare module "@/modules/types" {
  interface ModuleOptionsMap {
    blog: BlogOptions;
  }
}
