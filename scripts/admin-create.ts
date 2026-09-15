#!/usr/bin/env node
/**
 * Create (or reset) an admin user from the command line. Applies pending
 * migrations first, so it works on a fresh database.
 *
 *   npm run admin:create -- --email you@client.gr --name "Your Name"
 *   npm run admin:create -- --email you@client.gr --name "Your Name" --role admin
 *   ADMIN_PASSWORD=... npm run admin:create -- --email ... --name ...   (non-interactive)
 *
 * Roles: owner (default) | admin | editor. An existing email gets its password,
 * name and role updated and all its sessions revoked.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline";
import { parseArgs } from "node:util";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { createConnection, MIGRATIONS_DIR } from "../src/db/connection";
import { sessions, USER_ROLES, users, type UserRole } from "../src/db/schema/core";
import { hashPassword, MIN_PASSWORD_LENGTH } from "../src/admin/auth/password";

if (existsSync(".env")) process.loadEnvFile(".env");

const { values } = parseArgs({
  options: {
    email: { type: "string" },
    name: { type: "string" },
    role: { type: "string", default: "owner" },
  },
});

function fail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}

async function promptPassword(question: string): Promise<string> {
  if (!process.stdin.isTTY) fail("No TTY: pass the password via the ADMIN_PASSWORD env var.");
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  // Hide typed characters.
  (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (s) => {
    if (s.startsWith(question)) process.stdout.write(question);
  };
  const answer = await new Promise<string>((resolve) => rl.question(question, resolve));
  rl.close();
  process.stdout.write("\n");
  return answer;
}

const email = values.email?.trim().toLowerCase();
const name = values.name?.trim();
const role = values.role as UserRole;
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail("Pass a valid --email.");
if (!name) fail('Pass --name "Full Name".');
if (!USER_ROLES.includes(role)) fail(`--role must be one of: ${USER_ROLES.join(", ")}.`);

let password = process.env.ADMIN_PASSWORD ?? "";
if (!password) {
  password = await promptPassword("Password: ");
  const confirm = await promptPassword("Repeat password: ");
  if (password !== confirm) fail("Passwords do not match.");
}
if (password.length < MIN_PASSWORD_LENGTH) fail(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);

const { db, client } = createConnection(process.env.DATABASE_URL ?? "file:./data/site.db", process.env.DATABASE_AUTH_TOKEN);
await migrate(db, { migrationsFolder: path.resolve(MIGRATIONS_DIR) });

const passwordHash = await hashPassword(password);
const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);

if (existing) {
  await db.update(users).set({ name, role, passwordHash, disabled: false }).where(eq(users.id, existing.id));
  await db.delete(sessions).where(eq(sessions.userId, existing.id));
  console.log(`✓ Updated ${email} (${role}); existing sessions revoked.`);
} else {
  await db.insert(users).values({ email, name, role, passwordHash });
  console.log(`✓ Created ${email} (${role}). Sign in at /admin/login`);
}
client.close();
