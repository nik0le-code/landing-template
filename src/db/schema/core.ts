/**
 * Core tables shared by all modules: admin users and their sessions.
 * Module tables live in src/modules/<name>/db/schema.ts.
 *
 * Import only from `drizzle-orm` here — drizzle-kit loads this file directly.
 */
import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const USER_ROLES = ["owner", "admin", "editor"] as const;
export type UserRole = (typeof USER_ROLES)[number];

const timestamps = {
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
};

export const users = sqliteTable("users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role", { enum: USER_ROLES }).notNull().default("editor"),
  disabled: integer("disabled", { mode: "boolean" }).notNull().default(false),
  lastLoginAt: integer("last_login_at", { mode: "timestamp" }),
  ...timestamps,
});

export const sessions = sqliteTable(
  "sessions",
  {
    /** SHA-256 of the session token; the raw token only ever lives in the cookie. */
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
    userAgent: text("user_agent"),
    ...timestamps,
  },
  (table) => [index("sessions_user_id_idx").on(table.userId)],
);

export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;
