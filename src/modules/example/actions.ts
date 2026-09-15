import { defineAction } from "astro:actions";
import { z } from "astro/zod";
import { getDb } from "@/db";
import { exampleMessages } from "./db/schema";

/** Exposed as `actions.example.addMessage`. */
export const actions = {
  addMessage: defineAction({
    accept: "form",
    input: z.object({ text: z.string().trim().min(1).max(280) }),
    handler: async ({ text }, context) => {
      const [row] = await getDb().insert(exampleMessages).values({ text }).returning();
      // Cached pages that show messages must be refreshed.
      await context.cache.invalidate({ tags: ["example"] });
      return row;
    },
  }),
};
