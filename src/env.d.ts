/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    /** Locale of the current request (URL prefix, or the default locale for unprefixed routes). */
    lang: import("@site-config").Locale;
    /** Signed-in admin user on /admin, /api/admin and action requests; null otherwise. */
    user: import("@/admin/auth/session").SessionUser | null;
    sessionId: string | null;
  }
}
