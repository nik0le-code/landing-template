import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const bookings = sqliteTable(
  "bookings",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    /** "YYYY-MM-DD" and "HH:MM" in the site's timezone — no timezone maths on read. */
    date: text("date").notNull(),
    time: text("time").notNull(),
    /** Service `value` from the module options; "" when services aren't used. */
    service: text("service").notNull().default(""),
    name: text("name").notNull(),
    email: text("email").notNull(),
    phone: text("phone").notNull().default(""),
    people: integer("people"),
    notes: text("notes").notNull().default(""),
    status: text("status", { enum: ["pending", "confirmed", "cancelled", "completed"] }).notNull().default("pending"),
    adminNotes: text("admin_notes").notNull().default(""),
    locale: text("locale").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => [index("bookings_slot_idx").on(table.date, table.time), index("bookings_status_idx").on(table.status)],
);

export type Booking = typeof bookings.$inferSelect;
