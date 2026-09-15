/**
 * drizzle-kit reads the core schema plus the schema of EVERY module folder, enabled
 * or not. Toggling a module in modules.config.ts therefore never requires a new
 * migration (and disabling one never drops its tables). Run `db:generate` only
 * after editing a schema file or adding a new module folder.
 *
 *   npm run db:generate   create a migration from schema changes
 *   npm run db:migrate    apply migrations (the app also does this on startup)
 *   npm run db:studio     browse the database
 */
import { existsSync } from "node:fs";
import { defineConfig } from "drizzle-kit";
import { listAllSchemaFiles } from "./src/modules/resolve";

if (existsSync(".env")) process.loadEnvFile(".env");

const moduleSchemas = listAllSchemaFiles(process.cwd()).map((file) => `./${file}`);

export default defineConfig({
  dialect: "turso",
  schema: ["./src/db/schema/core.ts", ...moduleSchemas],
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "file:./data/site.db",
    authToken: process.env.DATABASE_AUTH_TOKEN,
  },
});
