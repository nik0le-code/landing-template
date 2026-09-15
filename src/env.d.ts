/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    /** Locale of the current request (URL prefix, or the default locale for unprefixed routes). */
    lang: import("@site-config").Locale;
  }
}
