/**
 * Database access for app code:
 *
 * ```ts
 * import { getDb } from "@/db";
 * import { examplePosts } from "@/modules/example/db/schema";
 * const rows = await getDb().select().from(examplePosts);
 * ```
 *
 * The connection is created lazily, so sites (or pages) that never touch the
 * database never open it.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { migrate } from "drizzle-orm/libsql/migrator";
import { DATABASE_AUTH_TOKEN, DATABASE_URL, DB_MIGRATE_ON_START } from "astro:env/server";
import { createConnection, MIGRATIONS_DIR, type Connection, type Database } from "./connection";

let connection: Connection | undefined;

export function getDb(): Database {
  connection ??= createConnection(DATABASE_URL, DATABASE_AUTH_TOKEN);
  return connection.db;
}

let migration: Promise<void> | undefined;

/**
 * Applies pending migrations once per process (called from middleware on the
 * first server-rendered request). With several replicas on a shared libSQL
 * server, set DB_MIGRATE_ON_START=false and run `npm run db:migrate` as a
 * one-off job / init container instead.
 */
export function ensureMigrated(): Promise<void> {
  if (!DB_MIGRATE_ON_START) return Promise.resolve();
  migration ??= (async () => {
    const folder = path.resolve(MIGRATIONS_DIR);
    if (!existsSync(path.join(folder, "meta", "_journal.json"))) return;
    await migrate(getDb(), { migrationsFolder: folder });
  })().catch((error) => {
    migration = undefined; // retry on the next request
    throw error;
  });
  return migration;
}
