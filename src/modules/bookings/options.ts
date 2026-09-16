/**
 * `modules.config.ts` → `options: { bookings: { … } }`
 *
 * ```ts
 * bookings: {
 *   basePath: "booking",
 *   services: [{ value: "consultation", label: { el: "Συμβουλευτική", en: "Consultation" } }],
 *   openDays: [1, 2, 3, 4, 5],
 *   slots: ["09:00", "10:00", "11:00", "17:00"],
 *   minNoticeHours: 24,
 *   maxDaysAhead: 60,
 * }
 * ```
 */
export interface BookingService {
  /** Stored with the booking; keep it stable. */
  value: string;
  label: Record<string, string>;
}

export interface BookingsOptions {
  /** URL segment: /[lang]/<basePath>. */
  basePath: string;
  /** Bookable services; empty hides the field. */
  services: BookingService[];
  /** Days that accept bookings: 0 = Sunday … 6 = Saturday. */
  openDays: number[];
  /** Selectable times, "HH:MM", in the site's timezone. */
  slots: string[];
  /** Earliest booking, in hours from now. */
  minNoticeHours: number;
  /** Latest booking, in days from today. */
  maxDaysAhead: number;
  /** Only one pending/confirmed booking per date+time. */
  oneBookingPerSlot: boolean;
  /** Ask how many people (e.g. restaurants). */
  askPeople: boolean;
  /** Extra recipients besides the settings module's notification emails. */
  notifyEmails: string[];
  /** Email the customer when a booking is confirmed or cancelled. */
  emailCustomer: boolean;
  /** Conversion name from siteConfig.tracking.conversions; "" disables. */
  conversion: string;
}

export const bookingsDefaults: BookingsOptions = {
  basePath: "booking", // keep in sync with optionDefaults in module.json
  services: [],
  openDays: [1, 2, 3, 4, 5],
  slots: ["09:00", "10:00", "11:00", "12:00", "16:00", "17:00", "18:00"],
  minNoticeHours: 24,
  maxDaysAhead: 60,
  oneBookingPerSlot: true,
  askPeople: false,
  notifyEmails: [],
  emailCustomer: true,
  conversion: "booking",
};

export const BOOKING_STATUSES = ["pending", "confirmed", "cancelled", "completed"] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

declare module "@/modules/types" {
  interface ModuleOptionsMap {
    bookings: BookingsOptions;
  }
}
