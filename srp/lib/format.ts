import { format } from "date-fns";

// Times are shown in Saudi time whatever machine renders them. date-fns
// formats in the process's own zone, which on Vercel is UTC: an interview
// booked for 10:00 in Riyadh rendered as 7:00 on the calendar. Riyadh has no
// daylight saving, and the SQL side already uses the same zone (0025, 0026).
const ZONE = "Asia/Riyadh";
const LOCALE = "ar-SA-u-ca-gregory-nu-latn";
const dateFormat = new Intl.DateTimeFormat(LOCALE, {
  timeZone: ZONE,
  day: "numeric",
  month: "long",
  year: "numeric",
});
const timeFormat = new Intl.DateTimeFormat(LOCALE, {
  timeZone: ZONE,
  hour: "numeric",
  minute: "2-digit",
});

export function formatDate(value: string) {
  return dateFormat.format(new Date(value));
}

export function formatDateTime(value: string) {
  const date = new Date(value);
  return `${dateFormat.format(date)}، ${timeFormat.format(date)}`;
}

const dayKeyFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const clockFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** The Riyadh calendar day of an instant, as YYYY-MM-DD (calendar grid keys). */
export function riyadhDayKey(value: string | Date) {
  return dayKeyFormat.format(new Date(value));
}

/** The Riyadh wall-clock time of an instant, as HH:mm. */
export function formatClock(value: string) {
  return clockFormat.format(new Date(value));
}

// Local date as YYYY-MM-DD (matches Postgres `current_date` semantics used
// by the application-insert RLS policy better than UTC ISO slicing).
export function todayISO() {
  return format(new Date(), "yyyy-MM-dd");
}
