import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export interface MediaVariant {
  format: "avif" | "webp" | "jpeg" | "png";
  width: number;
  height: number;
  /** Storage key, served at /media/<key>. */
  key: string;
  bytes: number;
}

export const mediaFiles = sqliteTable(
  "media_files",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    /** Original file name, for display and search only. */
    filename: text("filename").notNull(),
    alt: text("alt").notNull().default(""),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    /** Original upload size in bytes. */
    bytes: integer("bytes").notNull(),
    /** Dominant color (#rrggbb), used as a placeholder while the image loads. */
    color: text("color").notNull(),
    variants: text("variants", { mode: "json" }).$type<MediaVariant[]>().notNull(),
    uploadedBy: text("uploaded_by"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => [index("media_files_created_at_idx").on(table.createdAt)],
);

export type MediaFile = typeof mediaFiles.$inferSelect;
