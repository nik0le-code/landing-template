/** Booking submission, shared by the Astro Action and the no-JavaScript page. */
import { z } from "astro/zod";
import { siteConfig } from "@site-config";
import { getDb } from "@/db";
import { consume } from "@/lib/rate-limit";
import { bookings } from "../db/schema";
import { bookingsOptions } from "./availability";
import { checkSlot, type SlotProblem } from "./availability";
import { notifyNewBooking } from "./notify";

export type BookingField = "date" | "time" | "service" | "name" | "email" | "phone" | "people" | "notes";
export type FieldProblem = "required" | "invalidEmail" | "invalidPhone" | "tooLong" | "unknownService" | "invalidPeople" | SlotProblem;

export type BookingResult =
  | { ok: true; id: string }
  | { ok: false; code: "rateLimited" | "invalid"; fields?: Partial<Record<BookingField, FieldProblem>> };

export interface BookingInput {
  date: string;
  time: string;
  service: string;
  name: string;
  email: string;
  phone: string;
  people: string;
  notes: string;
  honeypot: string;
  locale: string;
  clientAddress: string;
}

export async function submitBooking(input: BookingInput): Promise<BookingResult> {
  const options = bookingsOptions();
  // Bots filling the hidden field get a fake success and nothing is stored.
  if (input.honeypot.trim()) return { ok: true, id: "" };

  // Two limits: many attempts are usually someone fixing validation errors, so only
  // stored bookings hit the strict limit; the loose one still stops abuse.
  if (!consume(`booking-attempts:${input.clientAddress}`, 30, 15 * 60_000).allowed) return { ok: false, code: "rateLimited" };

  const fields: Partial<Record<BookingField, FieldProblem>> = {};
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  const phone = input.phone.trim();
  const notes = input.notes.trim();

  if (!name) fields.name = "required";
  else if (name.length > 120) fields.name = "tooLong";
  if (!email) fields.email = "required";
  else if (!z.email().safeParse(email).success) fields.email = "invalidEmail";
  if (phone && !/^[+()\d\s.-]{6,40}$/.test(phone)) fields.phone = "invalidPhone";
  if (notes.length > 2000) fields.notes = "tooLong";
  if (options.services.length && !options.services.some((service) => service.value === input.service)) fields.service = "unknownService";

  const people = input.people ? Number(input.people) : null;
  if (options.askPeople && input.people && (!Number.isInteger(people) || people! < 1 || people! > 100)) fields.people = "invalidPeople";

  const slotProblem = await checkSlot(input.date, input.time);
  if (slotProblem) fields[slotProblem === "invalidTime" || slotProblem === "slotTaken" ? "time" : "date"] = slotProblem;

  if (Object.keys(fields).length) return { ok: false, code: "invalid", fields };

  if (!consume(`bookings:${input.clientAddress}`, 5, 15 * 60_000).allowed) return { ok: false, code: "rateLimited" };

  const locale = (siteConfig.locales as readonly string[]).includes(input.locale) ? input.locale : siteConfig.defaultLocale;
  const [booking] = await getDb()
    .insert(bookings)
    .values({
      date: input.date,
      time: input.time,
      service: options.services.length ? input.service : "",
      name,
      email,
      phone,
      people: options.askPeople ? people : null,
      notes,
      locale,
    })
    .returning();

  void notifyNewBooking(booking!);
  return { ok: true, id: booking!.id };
}
