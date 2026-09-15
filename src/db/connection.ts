/**
 * libSQL connection factory. No Astro imports, so CLI scripts (migrations, admin
 * seeding) can use it too. Inside the app use `getDb()` from "@/db".
 *
 * - `file:./data/site.db`  local SQLite file (single replica + persistent volume)
 * - `libsql://…`           sqld / Turso, safe for multiple replicas
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";

export type Database = LibSQLDatabase;

export interface Connection {
  client: Client;
  db: Database;
}

export function createConnection(url: string, authToken?: string): Connection {
  const isFile = url.startsWith("file:");
  if (isFile) {
    mkdirSync(path.dirname(path.resolve(url.slice("file:".length))), { recursive: true });
  }
  const client = createClient({ url, authToken });
  if (isFile) {
    // WAL: readers don't block the writer; busy_timeout: wait instead of failing under contention.
    void client.executeMultiple("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;");
  }
  return { client, db: drizzle(client) };
}

/** Folder with drizzle-kit migrations, relative to the working directory. */
export const MIGRATIONS_DIR = "drizzle";
