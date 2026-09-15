import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const leadSubmissions = sqliteTable(
  "leads_submissions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    /** Form key from the module options, e.g. "contact". */
    form: text("form").notNull(),
    name: text("name"),
    email: text("email"),
    phone: text("phone"),
    company: text("company"),
    subject: text("subject"),
    message: text("message"),
    status: text("status").notNull().default("new"),
    /** Internal notes, admin only. */
    notes: text("notes").notNull().default(""),
    locale: text("locale"),
    /** Page the form was submitted from. */
    pagePath: text("page_path"),
    /** First-touch attribution: utm_* and click ids. */
    attribution: text("attribution", { mode: "json" }).$type<Record<string, string>>(),
    /** Why the automatic spam check flagged it, if it did. */
    spamReason: text("spam_reason"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => [index("leads_created_at_idx").on(table.createdAt), index("leads_status_idx").on(table.status)],
);

export type LeadSubmission = typeof leadSubmissions.$inferSelect;
