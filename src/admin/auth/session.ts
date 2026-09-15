/**
 * Database-backed sessions. The cookie holds a random 256-bit token; the database
 * stores only its SHA-256, so a leaked database can't be used to log in.
 * Sessions last 30 days and slide forward when used in their second half.
 */
import { createHash, randomBytes } from "node:crypto";
import type { AstroCookies } from "astro";
import { and, eq, gt, lt, ne } from "drizzle-orm";
import { getDb } from "@/db";
import { sessions, users, type User } from "@/db/schema/core";

export const SESSION_COOKIE = "admin_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type SessionUser = Pick<User, "id" | "email" | "name" | "role">;

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

interface CookieContext {
  cookies: AstroCookies;
  url: URL;
}

/** `Secure` everywhere except plain-HTTP localhost, where browsers/tools would drop it. */
const isLocalHttp = (url: URL) => url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);

function setCookie({ cookies, url }: CookieContext, token: string, expires: Date) {
  cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: !isLocalHttp(url),
    sameSite: "lax",
    path: "/",
    expires,
  });
}

export async function createSession(context: CookieContext, userId: string, userAgent: string | null) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const db = getDb();
  await db.insert(sessions).values({ id: hashToken(token), userId, expiresAt, userAgent });
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, userId));
  // Opportunistic cleanup keeps the table small without a cron job.
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
  setCookie(context, token, expiresAt);
}

/** Resolves the logged-in user from the cookie, or null. Extends near-expiry sessions. */
export async function validateSession(context: CookieContext): Promise<{ user: SessionUser; sessionId: string } | null> {
  const { cookies } = context;
  const token = cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const id = hashToken(token);
  const db = getDb();
  const [row] = await db
    .select({ session: sessions, user: { id: users.id, email: users.email, name: users.name, role: users.role, disabled: users.disabled } })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, id), gt(sessions.expiresAt, new Date())))
    .limit(1);

  if (!row || row.user.disabled) {
    cookies.delete(SESSION_COOKIE, { path: "/" });
    return null;
  }

  if (row.session.expiresAt.getTime() - Date.now() < SESSION_TTL_MS / 2) {
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    await db.update(sessions).set({ expiresAt }).where(eq(sessions.id, id));
    setCookie(context, token, expiresAt);
  }

  const { disabled: _disabled, ...user } = row.user;
  return { user, sessionId: id };
}

export async function invalidateSession(cookies: AstroCookies) {
  const token = cookies.get(SESSION_COOKIE)?.value;
  if (token) await getDb().delete(sessions).where(eq(sessions.id, hashToken(token)));
  cookies.delete(SESSION_COOKIE, { path: "/" });
}

/** Signs a user out everywhere, optionally keeping the current session. */
export async function invalidateUserSessions(userId: string, keepSessionId?: string) {
  const condition = keepSessionId
    ? and(eq(sessions.userId, userId), ne(sessions.id, keepSessionId))
    : eq(sessions.userId, userId);
  await getDb().delete(sessions).where(condition);
}
