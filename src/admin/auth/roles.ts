import type { UserRole } from "@/db/schema/core";

const RANK: Record<UserRole, number> = { editor: 1, admin: 2, owner: 3 };

/** True when `role` is at least `required` (owner > admin > editor). */
export function hasRole(role: UserRole, required: UserRole): boolean {
  return RANK[role] >= RANK[required];
}
