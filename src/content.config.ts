import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

/**
 * Legal pages as Markdown, one file per locale: src/content/legal/<lang>/<slug>.md
 * Entry ids are "<lang>/<slug>".
 */
const legal = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/legal" }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    updatedAt: z.coerce.date(),
  }),
});

export const collections = { legal };
