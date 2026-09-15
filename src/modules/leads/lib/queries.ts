import { and, count, desc, eq, gte, like, ne, or, type SQL } from "drizzle-orm";
import { getDb } from "@/db";
import { leadSubmissions } from "../db/schema";

export interface LeadFilters {
  status?: string;
  form?: string;
  query?: string;
}

function where({ status, form, query }: LeadFilters): SQL | undefined {
  const conditions: SQL[] = [];
  if (status) conditions.push(eq(leadSubmissions.status, status));
  // Spam stays out of "all" unless explicitly selected.
  else conditions.push(ne(leadSubmissions.status, "spam"));
  if (form) conditions.push(eq(leadSubmissions.form, form));
  if (query) {
    const pattern = `%${query}%`;
    conditions.push(
      or(like(leadSubmissions.name, pattern), like(leadSubmissions.email, pattern), like(leadSubmissions.message, pattern), like(leadSubmissions.company, pattern))!,
    );
  }
  return and(...conditions);
}

export async function listLeads(filters: LeadFilters, page = 1, pageSize = 25) {
  const db = getDb();
  const condition = where(filters);
  const [items, [total]] = await Promise.all([
    db.select().from(leadSubmissions).where(condition).orderBy(desc(leadSubmissions.createdAt)).limit(pageSize).offset((page - 1) * pageSize),
    db.select({ value: count() }).from(leadSubmissions).where(condition),
  ]);
  return { items, total: total?.value ?? 0 };
}

/** Streams all matching rows in chunks (CSV export). */
export async function* iterateLeads(filters: LeadFilters, chunk = 500) {
  const db = getDb();
  for (let offset = 0; ; offset += chunk) {
    const rows = await db.select().from(leadSubmissions).where(where(filters)).orderBy(desc(leadSubmissions.createdAt)).limit(chunk).offset(offset);
    if (!rows.length) return;
    yield rows;
  }
}

export async function getLead(id: string) {
  const [row] = await getDb().select().from(leadSubmissions).where(eq(leadSubmissions.id, id)).limit(1);
  return row ?? null;
}

export async function countNewSince(date: Date) {
  const [row] = await getDb()
    .select({ value: count() })
    .from(leadSubmissions)
    .where(and(eq(leadSubmissions.status, "new"), gte(leadSubmissions.createdAt, date)));
  return row?.value ?? 0;
}
