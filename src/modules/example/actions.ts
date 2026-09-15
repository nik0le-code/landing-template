import { defineAction } from "astro:actions";
import { z } from "astro/zod";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { requireUser } from "@/admin/auth/guard";
import { formRequiredText } from "@/lib/form-schema";
import { exampleMessages } from "./db/schema";

/** Exposed as `actions.example.addMessage` / `actions.example.deleteMessage`. */
export const actions = {
  addMessage: defineAction({
    accept: "form",
    input: z.object({ text: formRequiredText(280) }),
    handler: async ({ text }, context) => {
      const [row] = await getDb().insert(exampleMessages).values({ text }).returning();
      // Cached pages that show messages must be refreshed.
      await context.cache.invalidate({ tags: ["example"] });
      return row;
    },
  }),

  /** Admin-only: every admin action starts with requireUser. */
  deleteMessage: defineAction({
    accept: "form",
    input: z.object({ id: z.coerce.number().int() }),
    handler: async ({ id }, context) => {
      requireUser(context, "editor");
      await getDb().delete(exampleMessages).where(eq(exampleMessages.id, id));
      await context.cache.invalidate({ tags: ["example"] });
      return { ok: true };
    },
  }),
};
