// Mapping between our meetings and Google Calendar events (shared by the mock and live clients).
import type { calendar_v3 } from "googleapis";
import { parseTime, toDateString, weekdayOf, type Weekday } from "./scheduling";

export type CalendarEvent = calendar_v3.Schema$Event;

/** Marks events this app created, so we never treat them as outside room reservations. */
export const MANAGED_BY = "comp523-scheduler";

const TO_RRULE: Record<Weekday, string> = { MON: "MO", TUE: "TU", WED: "WE", THU: "TH", FRI: "FR", SAT: "SA", SUN: "SU" };
const FROM_RRULE = Object.fromEntries(Object.entries(TO_RRULE).map(([k, v]) => [v, k])) as Record<string, Weekday>;
const FAR_FUTURE = new Date("2100-01-01T00:00:00Z");

export interface EventMeeting {
  /** Stable link between a meeting and its event: the 25Live reservation ID, or our own ID. */
  key: string;
  days: Weekday[];
  startMinute: number;
  endMinute: number;
  startDate: Date;
  endDate: Date;
  courseCode: string;
  section: string;
  title: string;
  roomName: string | null;
  instructorName: string | null;
}

export interface EventSlot {
  days: Weekday[];
  startMinute: number;
  endMinute: number;
  startDate: Date;
  endDate: Date;
}

export function meetingToEvent(m: EventMeeting): CalendarEvent {
  const timeZone = process.env.CALENDAR_TIMEZONE || "America/New_York";
  const first = firstOccurrence(m.startDate, m.days);
  const until = toDateString(m.endDate).replace(/-/g, "") + "T235959Z";
  return {
    summary: `${m.courseCode}-${m.section} ${m.title}`,
    location: m.roomName ?? undefined,
    description: m.instructorName ? `Instructor: ${m.instructorName}` : undefined,
    start: { dateTime: localDateTime(first, m.startMinute), timeZone },
    end: { dateTime: localDateTime(first, m.endMinute), timeZone },
    recurrence: [`RRULE:FREQ=WEEKLY;BYDAY=${m.days.map((d) => TO_RRULE[d]).join(",")};UNTIL=${until}`],
    extendedProperties: { private: { managedBy: MANAGED_BY, scheduleKey: m.key } },
  };
}

/** The meeting key of an event this app manages, or null for everyone else's events. */
export function managedKey(event: CalendarEvent): string | null {
  const props = event.extendedProperties?.private;
  return props?.managedBy === MANAGED_BY ? (props.scheduleKey ?? null) : null;
}

/** Fields where `actual` differs from what the schedule says it should be. */
export function eventDifferences(actual: CalendarEvent, expected: CalendarEvent) {
  const fields: [string, (e: CalendarEvent) => string][] = [
    ["title", (e) => e.summary ?? ""],
    ["room", (e) => e.location ?? ""],
    // The live API adds a UTC offset ("...-04:00"); compare wall-clock time only.
    ["start", (e) => e.start?.dateTime?.slice(0, 19) ?? ""],
    ["end", (e) => e.end?.dateTime?.slice(0, 19) ?? ""],
    ["repeats", (e) => (e.recurrence ?? []).join(";")],
  ];
  return fields
    .map(([field, get]) => ({ field, actual: get(actual), expected: get(expected) }))
    .filter((d) => d.actual !== d.expected);
}

/**
 * Reads when an event happens. Returns null for things we can't place on the weekly grid:
 * all-day events, multi-day events, and non-weekly recurrence.
 */
export function eventToSlot(event: CalendarEvent): EventSlot | null {
  const start = event.start?.dateTime;
  const end = event.end?.dateTime;
  if (!start || !end || start.slice(0, 10) !== end.slice(0, 10)) return null;

  const firstDate = new Date(`${start.slice(0, 10)}T00:00:00Z`);
  const startMinute = parseTime(start.slice(11, 16));
  const endMinute = parseTime(end.slice(11, 16));
  const rrule = event.recurrence?.find((r) => r.startsWith("RRULE:"));
  if (!rrule) return { days: [weekdayOf(firstDate)], startMinute, endMinute, startDate: firstDate, endDate: firstDate };

  const parts = Object.fromEntries(rrule.slice("RRULE:".length).split(";").map((p) => p.split("=")));
  if (parts.FREQ !== "WEEKLY" || parts.COUNT || (parts.INTERVAL && parts.INTERVAL !== "1")) return null;
  const days = parts.BYDAY ? parts.BYDAY.split(",").map((d: string) => FROM_RRULE[d]) : [weekdayOf(firstDate)];
  if (days.some((d: Weekday | undefined) => !d)) return null;
  const until: string | undefined = parts.UNTIL;
  const endDate = until ? new Date(`${until.slice(0, 4)}-${until.slice(4, 6)}-${until.slice(6, 8)}T00:00:00Z`) : FAR_FUTURE;
  return { days, startMinute, endMinute, startDate: firstDate, endDate };
}

/** First date on or after `start` that falls on one of `days`. */
function firstOccurrence(start: Date, days: Weekday[]): Date {
  const d = new Date(start);
  for (let i = 0; i < 7 && !days.includes(weekdayOf(d)); i++) d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

function localDateTime(date: Date, minute: number): string {
  const hh = String(Math.floor(minute / 60)).padStart(2, "0");
  const mm = String(minute % 60).padStart(2, "0");
  return `${toDateString(date)}T${hh}:${mm}:00`;
}

/** Event descriptions are HTML; keep the text and line breaks. */
export function htmlToText(html: string | null | undefined): string | null {
  if (!html) return null;
  const text = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text || null;
}

/** How the room itself answered the invitation. Room calendars mark bookings they turned down as "declined". */
export function roomResponse(event: CalendarEvent, roomCalendarId: string): string | null {
  const room = event.attendees?.find((a) => a.self || a.email === roomCalendarId);
  return room?.responseStatus ?? null;
}
