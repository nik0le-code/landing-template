/**
 * Booking rules: which dates and times can be requested. Dates are plain
 * "YYYY-MM-DD" strings in the server's timezone (set TZ on the container), so no
 * timezone conversion happens between the form, the database and the admin.
 */
import { and, eq, gte, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { getModuleOptions } from "@/modules/registry";
import { bookings } from "../db/schema";
import { bookingsDefaults } from "../options";

export const bookingsOptions = () => getModuleOptions("bookings", bookingsDefaults);

export const bookingsPath = (lang: string, sub = "") => `/${lang}/${bookingsOptions().basePath}${sub}`;

const pad = (n: number) => String(n).padStart(2, "0");
export const toDateString = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/** Parses "YYYY-MM-DD" + "HH:MM" as local time; null when malformed. */
export function parseSlot(date: string, time: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  const [hour, minute] = time.split(":").map(Number) as [number, number];
  const parsed = new Date(year, month - 1, day, hour, minute, 0, 0);
  return Number.isNaN(parsed.getTime()) || parsed.getMonth() !== month - 1 ? null : parsed;
}

export interface DateRange {
  min: string;
  max: string;
}

/** Earliest and latest selectable dates, for the date input's min/max. */
export function dateRange(): DateRange {
  const options = bookingsOptions();
  const earliest = new Date(Date.now() + options.minNoticeHours * 3_600_000);
  const latest = new Date();
  latest.setDate(latest.getDate() + options.maxDaysAhead);
  return { min: toDateString(earliest), max: toDateString(latest) };
}

export type SlotProblem = "invalidDate" | "closedDay" | "invalidTime" | "tooSoon" | "tooFar" | "slotTaken";

/** Validates a requested slot against the rules and existing bookings. */
export async function checkSlot(date: string, time: string): Promise<SlotProblem | null> {
  const options = bookingsOptions();
  const when = parseSlot(date, time);
  if (!when) return "invalidDate";
  if (!options.slots.includes(time)) return "invalidTime";
  if (!options.openDays.includes(when.getDay())) return "closedDay";
  if (when.getTime() < Date.now() + options.minNoticeHours * 3_600_000) return "tooSoon";
  const range = dateRange();
  if (date > range.max) return "tooFar";
  if (options.oneBookingPerSlot && (await takenSlots(date)).includes(time)) return "slotTaken";
  return null;
}

/** Times already requested or confirmed on a date. */
export async function takenSlots(date: string): Promise<string[]> {
  if (!bookingsOptions().oneBookingPerSlot) return [];
  const rows = await getDb()
    .select({ time: bookings.time })
    .from(bookings)
    .where(and(eq(bookings.date, date), inArray(bookings.status, ["pending", "confirmed"])));
  return rows.map((row) => row.time);
}

/** Times still selectable on a date (also filters out today's past slots). */
export async function availableSlots(date: string): Promise<string[]> {
  const options = bookingsOptions();
  const when = parseSlot(date, "12:00");
  if (!when || !options.openDays.includes(when.getDay())) return [];
  const taken = new Set(await takenSlots(date));
  const earliest = Date.now() + options.minNoticeHours * 3_600_000;
  return options.slots.filter((slot) => !taken.has(slot) && (parseSlot(date, slot)?.getTime() ?? 0) >= earliest);
}

export async function upcomingCount() {
  const today = toDateString(new Date());
  const rows = await getDb()
    .select({ id: bookings.id })
    .from(bookings)
    .where(and(eq(bookings.status, "pending"), gte(bookings.date, today)));
  return rows.length;
}
