import { ActionError, type ActionAPIContext } from "astro:actions";
import type { UserRole } from "@/db/schema/core";
import { hasRole } from "./roles";
import type { SessionUser } from "./session";

/**
 * First line of every admin action handler. Actions are callable from anywhere,
 * so the check belongs in the handler — not only in page middleware.
 *
 * ```ts
 * handler: async (input, context) => {
 *   const user = requireUser(context, "editor");
 * }
 * ```
 */
export function requireUser(context: Pick<ActionAPIContext, "locals">, role: UserRole = "editor"): SessionUser {
  const user = context.locals.user;
  if (!user) throw new ActionError({ code: "UNAUTHORIZED" });
  if (!hasRole(user.role, role)) throw new ActionError({ code: "FORBIDDEN" });
  return user;
}
