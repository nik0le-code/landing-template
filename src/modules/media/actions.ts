import { defineAction } from "astro:actions";
import { z } from "astro/zod";
import { requireUser } from "@/admin/auth/guard";
import { formText } from "@/lib/form-schema";
import { updateAlt } from "./lib/queries";
import { deleteMedia } from "./lib/upload";

/** `actions.media.*` — admin only. */
export const actions = {
  updateAlt: defineAction({
    accept: "form",
    input: z.object({ id: z.uuid(), alt: formText(300) }),
    handler: async ({ id, alt }, context) => {
      requireUser(context, "editor");
      await updateAlt(id, alt);
      return { ok: true };
    },
  }),

  delete: defineAction({
    accept: "form",
    input: z.object({ id: z.uuid() }),
    handler: async ({ id }, context) => {
      requireUser(context, "editor");
      await deleteMedia(id);
      return { ok: true };
    },
  }),
};
