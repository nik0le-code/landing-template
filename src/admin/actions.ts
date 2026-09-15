/**
 * Core admin actions, exposed as `actions.admin.*`. Registered only when the admin
 * area is enabled (see src/integrations/modules.ts).
 *
 * Error messages are translation keys under `admin.errors.*`; pages translate them.
 */
import { ActionError, defineAction } from "astro:actions";
import { ADMIN_SETUP_TOKEN } from "astro:env/server";
import { z } from "astro/zod";
import { and, count, eq, ne } from "drizzle-orm";
import { timingSafeEqual } from "node:crypto";
import { getDb } from "@/db";
import { USER_ROLES, users } from "@/db/schema/core";
import { requireUser } from "./auth/guard";
import { DUMMY_HASH, hashPassword, MIN_PASSWORD_LENGTH, verifyPassword } from "./auth/password";
import { consume, reset } from "./auth/rate-limit";
import { hasRole } from "./auth/roles";
import { createSession, invalidateSession, invalidateUserSessions } from "./auth/session";

const email = z.string().trim().toLowerCase().pipe(z.email());
const password = z.string().min(MIN_PASSWORD_LENGTH, "passwordTooShort").max(256);
const name = z.string().trim().min(1).max(120);

const fail = (code: ActionError["code"], message: string): never => {
  throw new ActionError({ code, message });
};

async function activeOwnerCount(excludeUserId?: string) {
  const conditions = [eq(users.role, "owner"), eq(users.disabled, false)];
  if (excludeUserId) conditions.push(ne(users.id, excludeUserId));
  const [row] = await getDb().select({ value: count() }).from(users).where(and(...conditions));
  return row?.value ?? 0;
}

export async function hasAnyUser() {
  const [row] = await getDb().select({ value: count() }).from(users);
  return (row?.value ?? 0) > 0;
}

export const actions = {
  login: defineAction({
    accept: "form",
    input: z.object({ email, password: z.string().max(256) }),
    handler: async (input, context) => {
      // Two windows: per email+IP (typos) and per email (distributed guessing).
      const ipKey = `login:${input.email}:${context.clientAddress}`;
      const emailKey = `login:${input.email}`;
      const byIp = consume(ipKey, 5, 15 * 60_000);
      const byEmail = consume(emailKey, 20, 60 * 60_000);
      if (!byIp.allowed || !byEmail.allowed) {
        const seconds = Math.max(byIp.allowed ? 0 : byIp.retryAfterSeconds, byEmail.allowed ? 0 : byEmail.retryAfterSeconds);
        fail("TOO_MANY_REQUESTS", `tooManyAttempts:${Math.ceil(seconds / 60)}`);
      }

      const [user] = await getDb().select().from(users).where(eq(users.email, input.email)).limit(1);
      const valid = await verifyPassword(input.password, user?.passwordHash ?? DUMMY_HASH);
      if (!user || !valid || user.disabled) fail("UNAUTHORIZED", "invalidCredentials");

      reset(ipKey);
      await createSession(context, user!.id, context.request.headers.get("user-agent"));
      return { ok: true };
    },
  }),

  logout: defineAction({
    accept: "form",
    handler: async (_input, context) => {
      await invalidateSession(context.cookies);
      return { ok: true };
    },
  }),

  /** First owner account via the web, for deployments without shell access. */
  setup: defineAction({
    accept: "form",
    input: z.object({ token: z.string(), name, email, password }),
    handler: async (input, context) => {
      if (await hasAnyUser()) fail("FORBIDDEN", "setupDone");
      const expected = Buffer.from(ADMIN_SETUP_TOKEN ?? "");
      const given = Buffer.from(input.token);
      const tokenOk = expected.length >= 16 && expected.length === given.length && timingSafeEqual(expected, given);
      if (!tokenOk) fail("FORBIDDEN", "invalidSetupToken");

      const [user] = await getDb()
        .insert(users)
        .values({ name: input.name, email: input.email, passwordHash: await hashPassword(input.password), role: "owner" })
        .returning({ id: users.id });
      await createSession(context, user!.id, context.request.headers.get("user-agent"));
      return { ok: true };
    },
  }),

  updateProfile: defineAction({
    accept: "form",
    input: z.object({ name, email }),
    handler: async (input, context) => {
      const user = requireUser(context);
      const [taken] = await getDb()
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.email, input.email), ne(users.id, user.id)))
        .limit(1);
      if (taken) fail("CONFLICT", "emailTaken");
      await getDb().update(users).set({ name: input.name, email: input.email }).where(eq(users.id, user.id));
      return { ok: true };
    },
  }),

  changePassword: defineAction({
    accept: "form",
    input: z.object({ currentPassword: z.string().max(256), newPassword: password }),
    handler: async (input, context) => {
      const user = requireUser(context);
      const [row] = await getDb().select({ hash: users.passwordHash }).from(users).where(eq(users.id, user.id));
      if (!row || !(await verifyPassword(input.currentPassword, row.hash))) fail("BAD_REQUEST", "wrongPassword");
      await getDb()
        .update(users)
        .set({ passwordHash: await hashPassword(input.newPassword) })
        .where(eq(users.id, user.id));
      await invalidateUserSessions(user.id, context.locals.sessionId ?? undefined);
      return { ok: true };
    },
  }),

  revokeOtherSessions: defineAction({
    accept: "form",
    handler: async (_input, context) => {
      const user = requireUser(context);
      await invalidateUserSessions(user.id, context.locals.sessionId ?? undefined);
      return { ok: true };
    },
  }),

  createUser: defineAction({
    accept: "form",
    input: z.object({ name, email, role: z.enum(USER_ROLES), password }),
    handler: async (input, context) => {
      const actor = requireUser(context, "admin");
      if (input.role === "owner" && actor.role !== "owner") fail("FORBIDDEN", "ownerOnly");
      const [taken] = await getDb().select({ id: users.id }).from(users).where(eq(users.email, input.email)).limit(1);
      if (taken) fail("CONFLICT", "emailTaken");
      const [created] = await getDb()
        .insert(users)
        .values({ name: input.name, email: input.email, role: input.role, passwordHash: await hashPassword(input.password) })
        .returning({ id: users.id });
      return { id: created!.id };
    },
  }),

  updateUser: defineAction({
    accept: "form",
    input: z.object({
      id: z.string(),
      name,
      email,
      role: z.enum(USER_ROLES),
      disabled: z.coerce.boolean().default(false),
      password: z.union([z.literal(""), password]).optional(),
    }),
    handler: async (input, context) => {
      const actor = requireUser(context, "admin");
      const [target] = await getDb().select().from(users).where(eq(users.id, input.id)).limit(1);
      if (!target) fail("NOT_FOUND", "generic");

      const touchesOwner = target!.role === "owner" || input.role === "owner";
      if (touchesOwner && actor.role !== "owner") fail("FORBIDDEN", "ownerOnly");
      const isSelf = target!.id === actor.id;
      if (isSelf && (input.role !== target!.role || input.disabled)) fail("BAD_REQUEST", "cannotChangeSelf");
      const losesOwner = target!.role === "owner" && (input.role !== "owner" || input.disabled);
      if (losesOwner && (await activeOwnerCount(target!.id)) === 0) fail("BAD_REQUEST", "lastOwner");

      const [taken] = await getDb()
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.email, input.email), ne(users.id, input.id)))
        .limit(1);
      if (taken) fail("CONFLICT", "emailTaken");

      await getDb()
        .update(users)
        .set({
          name: input.name,
          email: input.email,
          role: input.role,
          disabled: input.disabled,
          ...(input.password ? { passwordHash: await hashPassword(input.password) } : {}),
        })
        .where(eq(users.id, input.id));
      if (input.password || input.disabled) await invalidateUserSessions(input.id);
      return { ok: true };
    },
  }),

  deleteUser: defineAction({
    accept: "form",
    input: z.object({ id: z.string() }),
    handler: async (input, context) => {
      const actor = requireUser(context, "admin");
      if (input.id === actor.id) fail("BAD_REQUEST", "cannotChangeSelf");
      const [target] = await getDb().select().from(users).where(eq(users.id, input.id)).limit(1);
      if (!target) return { ok: true };
      if (target.role === "owner" && !hasRole(actor.role, "owner")) fail("FORBIDDEN", "ownerOnly");
      if (target.role === "owner" && (await activeOwnerCount(target.id)) === 0) fail("BAD_REQUEST", "lastOwner");
      await getDb().delete(users).where(eq(users.id, input.id));
      return { ok: true };
    },
  }),
};
