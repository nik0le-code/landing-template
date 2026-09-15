/** Read/update queries for media records (no image processing). */
import { desc, eq, inArray, like, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { mediaFiles, type MediaFile } from "../db/schema";

export async function listMedia({ query = "", page = 1, pageSize = 40 } = {}) {
  const db = getDb();
  const filter = query ? or(like(mediaFiles.filename, `%${query}%`), like(mediaFiles.alt, `%${query}%`)) : undefined;
  const [items, [total]] = await Promise.all([
    db
      .select()
      .from(mediaFiles)
      .where(filter)
      .orderBy(desc(mediaFiles.createdAt), desc(mediaFiles.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ value: sql<number>`count(*)` }).from(mediaFiles).where(filter),
  ]);
  return { items, total: total?.value ?? 0, page, pageSize };
}

export async function getMedia(id: string): Promise<MediaFile | null> {
  const [row] = await getDb().select().from(mediaFiles).where(eq(mediaFiles.id, id)).limit(1);
  return row ?? null;
}

/** Batch lookup for pages rendering many images; returns a map by id. */
export async function getMediaMap(ids: string[]): Promise<Map<string, MediaFile>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return new Map();
  const rows = await getDb().select().from(mediaFiles).where(inArray(mediaFiles.id, unique));
  return new Map(rows.map((row) => [row.id, row]));
}

export async function updateAlt(id: string, alt: string) {
  await getDb().update(mediaFiles).set({ alt }).where(eq(mediaFiles.id, id));
}
