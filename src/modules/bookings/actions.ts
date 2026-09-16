import { ActionError, defineAction } from "astro:actions";
import { z } from "astro/zod";
import { eq } from "drizzle-orm";
import { requireUser } from "@/admin/auth/guard";
import { getDb } from "@/db";
import { formText } from "@/lib/form-schema";
import { bookings } from "./db/schema";
import { BOOKING_STATUSES } from "./options";
import { notifyCustomer } from "./lib/notify";
import { submitBooking } from "./lib/submit";

/** `actions.bookings.*` */
export const actions = {
  /** Public: used by <BookingForm> when JavaScript is available. */
  request: defineAction({
    accept: "form",
    input: z.object({
      date: formText(10),
      time: formText(5),
      service: formText(60),
      name: formText(120),
      email: formText(254),
      phone: formText(40),
      people: formText(3),
      notes: formText(2000),
      website: formText(200),
      locale: formText(10),
    }),
    handler: async (input, context) => {
      const result = await submitBooking({ ...input, honeypot: input.website, clientAddress: context.clientAddress });
      if (!result.ok) {
        throw new ActionError({
          code: result.code === "rateLimited" ? "TOO_MANY_REQUESTS" : "BAD_REQUEST",
          message: JSON.stringify({ code: result.code, fields: result.fields ?? {} }),
        });
      }
      return { ok: true };
    },
  }),

  update: defineAction({
    accept: "form",
    input: z.object({ id: z.uuid(), status: z.enum(BOOKING_STATUSES), adminNotes: formText(2000) }),
    handler: async ({ id, status, adminNotes }, context) => {
      requireUser(context, "editor");
      const [previous] = await getDb().select().from(bookings).where(eq(bookings.id, id)).limit(1);
      if (!previous) throw new ActionError({ code: "NOT_FOUND" });
      const [updated] = await getDb()
        .update(bookings)
        .set({ status, adminNotes, updatedAt: new Date() })
        .where(eq(bookings.id, id))
        .returning();
      // Tell the customer only when the decision changes.
      if (status !== previous.status && (status === "confirmed" || status === "cancelled")) void notifyCustomer(updated!, status);
      return { ok: true };
    },
  }),

  delete: defineAction({
    accept: "form",
    input: z.object({ id: z.uuid() }),
    handler: async ({ id }, context) => {
      requireUser(context, "admin");
      await getDb().delete(bookings).where(eq(bookings.id, id));
      return { ok: true };
    },
  }),
};
