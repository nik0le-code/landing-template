/**
 * Astro Actions entrypoint. Module actions are registered automatically from the
 * generated list (enabled modules only) and exposed as `actions.<module>.<name>`.
 * Add site-specific actions next to the spread.
 */
import { moduleActions } from "@/modules/.generated/actions";

export const server = {
  ...moduleActions,
};
