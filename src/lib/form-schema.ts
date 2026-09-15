/**
 * Zod helpers for Astro Actions with `accept: "form"`.
 *
 * Astro converts an EMPTY form field to `undefined` only when the field's outermost
 * schema is `.optional()`; for anything else (`.default("")`, `.refine()`, unions…)
 * it passes `null`, and `z.string()` then rejects it. Every text field that may be
 * left empty must therefore use these helpers, not `z.string().default("")`.
 */
import { z } from "astro/zod";

/** Optional text: empty/missing → "". Trimmed. */
export const formText = (max: number) =>
  z
    .string()
    .max(max)
    .nullish()
    .transform((value) => (value ?? "").trim());

/** Required text: empty/missing → "required" error. Trimmed. */
export const formRequiredText = (max: number) =>
  z
    .string({ error: "required" })
    .trim()
    .min(1, "required")
    .max(max);

const isHttpUrl = (value: string) => z.url({ protocol: /^https?$/ }).safeParse(value).success;

/** Optional http(s) URL; "" allowed. */
export const formUrl = () => formText(500).refine((value) => value === "" || isHttpUrl(value), "invalidUrl");

/** Optional link: site path ("/contact") or http(s) URL; "" allowed. Rejects "//host". */
export const formLink = () =>
  formText(500).refine((value) => value === "" || /^\/(?!\/)/.test(value) || isHttpUrl(value), "invalidUrl");

/**
 * Checkbox: true only for a real value ("on", "true"…). Astro's own z.boolean()
 * handling treats any present field as checked, so "field=" would count as ticked.
 */
export const formCheckbox = () => formText(10).transform((value) => value !== "" && value !== "false");
