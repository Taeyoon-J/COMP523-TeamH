// Room search: turns text like "FB", "009" or "Wednesday 1:15 min class with capacity at least 50"
// into filters, and works out when a room is free. Pure functions, shared by the web page and the CLI.
import { formatTimeRange, normalizeRoomName, parseTime, WEEKDAYS, type Weekday } from "./scheduling";

export type RoomCategory = "Classroom" | "Conference Room";

export interface SearchQuery {
  /** Canonical fragment the room name must contain ("SN", "009", "FB009"); "" matches every room. */
  roomText: string;
  category: RoomCategory | null;
  minCapacity: number | null;
  /** Weekdays the room must be free on, every week. */
  days: Weekday[];
  startMinute: number | null;
  /** Length of the class in minutes. */
  duration: number | null;
  /** A single date (YYYY-MM-DD) instead of "every week". */
  date: string | null;
}

export const EMPTY_QUERY: SearchQuery = {
  roomText: "",
  category: null,
  minCapacity: null,
  days: [],
  startMinute: null,
  duration: null,
  date: null,
};

const BUILDINGS: Record<string, string> = { FB: "Brooks Building", SN: "Sitterson Hall" };

export function buildingName(roomName: string): string | null {
  return BUILDINGS[roomName.slice(0, 2)] ?? null;
}

const DAY_WORDS: [RegExp, Weekday[]][] = [
  [/\bmwf\b/, ["MON", "WED", "FRI"]],
  [/\bmw\b/, ["MON", "WED"]],
  [/\b(tr|tth|tuth)\b/, ["TUE", "THU"]],
  [/\bmon(day)?s?\b/, ["MON"]],
  [/\btue(s|sday)?s?\b/, ["TUE"]],
  [/\bwed(nesday)?s?\b/, ["WED"]],
  [/\bthu(r|rs|rsday)?s?\b/, ["THU"]],
  [/\bfri(day)?s?\b/, ["FRI"]],
  [/\bsat(urday)?s?\b/, ["SAT"]],
  [/\bsun(day)?s?\b/, ["SUN"]],
];

const FILLER = new Set(
  "a an the class classes lecture meeting room rooms with for on in of need needs want find free available open every each and or that is at least capacity seat seats people students min minute minutes long course".split(
    " ",
  ),
);

/**
 * Reads a free-text search. Anything that isn't a day, time, length, capacity, date, building or
 * room type is treated as part of a room name.
 */
export function parseSearch(text: string): SearchQuery {
  const q: SearchQuery = { ...EMPTY_QUERY, days: [] };
  let s = ` ${text.toLowerCase().replace(/[,;]/g, " ")} `;
  const take = (re: RegExp, fn: (m: RegExpMatchArray) => void) => {
    const m = s.match(re);
    if (m) {
      fn(m);
      s = s.replace(m[0], " ");
    }
  };

  take(/\b(\d{4}-\d{2}-\d{2})\b/, (m) => (q.date = m[1]));

  // Capacity: "capacity at least 50", "at least 50 seats", "50+ seats", "50+", "cap 50", ">= 50"
  take(
    /(?:capacity|cap|seats?|size)\s*(?:of\s*|:\s*)?(?:at\s+least\s*|>=?\s*|≥\s*|min(?:imum)?\s*)?(\d+)\s*\+?/,
    (m) => (q.minCapacity = Number(m[1])),
  );
  take(/(?:at\s+least|>=?|≥|min(?:imum)?(?:\s+of)?)\s*(\d+)\s*(?:seats?|people|students|capacity)?/, (m) => (q.minCapacity = Number(m[1])));
  take(/\b(\d+)\s*\+?\s*(?:seats?|people|students)\b/, (m) => (q.minCapacity = Number(m[1])));
  take(/\b(\d+)\s*\+(?=\s)/, (m) => (q.minCapacity = Number(m[1])));

  // Start time: "at 1:15", "from 2pm", "starting 9:30", or any time with am/pm
  take(/\b(?:at|from|starting(?:\s+at)?|start(?:ing)?)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)(?=\s)/, (m) => (q.startMinute = toMinute(m[1])));
  take(/\b(\d{1,2}(?::\d{2})?\s*(?:am|pm))(?=\s)/, (m) => (q.startMinute = toMinute(m[1])));

  // Length: "1:15 min", "1:15 class", "75 min", "1h15m", "1.5 hours", "2 hr"
  take(/\b(\d{1,2}):(\d{2})\s*(?=(?:min|mins|minutes|hours?|hrs?|long|class|lecture|meeting)\b)/, (m) => (q.duration = Number(m[1]) * 60 + Number(m[2])));
  take(/\b(\d+)\s*h(?:r|rs|our|ours)?\s*(\d+)\s*m(?:in|ins|inutes?)?\b/, (m) => (q.duration = Number(m[1]) * 60 + Number(m[2])));
  take(/\b(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)\b/, (m) => (q.duration = Math.round(Number(m[1]) * 60)));
  take(/\b(\d+)\s*(?:m|min|mins|minute|minutes)\b/, (m) => (q.duration = Number(m[1])));
  // A bare "1:15" that wasn't a start time or a length: most likely a start time.
  take(/\b(\d{1,2}:\d{2})(?=\s)/, (m) => (q.startMinute = toMinute(m[1])));

  for (const [re, days] of DAY_WORDS) {
    while (re.test(s)) {
      q.days.push(...days);
      s = s.replace(re, " ");
    }
  }
  q.days = WEEKDAYS.filter((d) => q.days.includes(d));

  take(/\bconference(?:\s+rooms?)?\b/, () => (q.category = "Conference Room"));
  take(/\bclassrooms?\b/, () => (q.category = "Classroom"));

  let building = "";
  take(/\b(?:fred\s+)?brooks(?:\s+building)?\b/, () => (building = "FB"));
  take(/\bsitterson(?:\s+hall)?\b/, () => (building = "SN"));

  const rest = s
    .split(/\s+/)
    .filter((t) => t && !FILLER.has(t))
    .join("");
  q.roomText = normalizeRoomName(building + rest);
  return q;
}

/** Afternoon is more likely than early morning for a bare "1:15" or "3". */
function toMinute(text: string): number {
  const minute = parseTime(text);
  const hasMeridiem = /am|pm/i.test(text);
  return !hasMeridiem && minute < 7 * 60 ? minute + 12 * 60 : minute;
}

export function matchesRoom(room: { name: string; capacity: number; category: string | null }, q: SearchQuery): boolean {
  if (q.roomText && !room.name.includes(q.roomText)) return false;
  if (q.minCapacity !== null && room.capacity < q.minCapacity) return false;
  if (q.category && room.category !== q.category) return false;
  return true;
}

/** True when the query asks about time, not just which rooms exist. */
export function hasTimeQuery(q: SearchQuery): boolean {
  return q.days.length > 0 || q.date !== null;
}

export interface BusySlot {
  label: string;
  days: Weekday[];
  startMinute: number;
  endMinute: number;
  /** Inclusive YYYY-MM-DD dates. */
  startDate: string;
  endDate: string;
}

export interface Window {
  start: number;
  end: number;
}

export interface RoomAvailability {
  /** Whether the room works for the requested time (or has a long-enough free window). */
  fits: boolean;
  /** Times free on every checked date, within opening hours. */
  freeWindows: Window[];
  /** What occupies the requested time, when a start time was given. */
  blockers: string[];
  /** How many dates were checked (e.g. 16 Wednesdays). */
  dates: number;
}

export const OPEN_HOURS: Window = { start: 8 * 60, end: 21 * 60 };
/** Assumed class length when only a start time is given (a MWF class at UNC). */
export const DEFAULT_DURATION = 50;
/** Shortest free window worth listing when no length is given. */
const MIN_WINDOW = 30;

/**
 * When a room is free on the requested day(s): on `q.date`, or on every matching weekday in `range`.
 * Returns null if the query has no day or date.
 */
export function roomAvailability(
  busy: BusySlot[],
  q: SearchQuery,
  range: { from: string; to: string },
  hours: Window = OPEN_HOURS,
): RoomAvailability | null {
  if (!hasTimeQuery(q)) return null;

  const dates = q.date ? [q.date] : datesOn(q.days, range.from, range.to);
  const busyIntervals: (Window & { label: string })[] = [];
  for (const date of dates) {
    const weekday = weekdayOfDate(date);
    for (const b of busy) {
      if (b.startDate <= date && date <= b.endDate && b.days.includes(weekday)) {
        busyIntervals.push({ start: b.startMinute, end: b.endMinute, label: b.label });
      }
    }
  }

  const freeWindows = complement(merge(busyIntervals), hours).filter((w) => w.end - w.start >= (q.duration ?? MIN_WINDOW));

  if (q.startMinute !== null) {
    const want = { start: q.startMinute, end: q.startMinute + (q.duration ?? DEFAULT_DURATION) };
    const blockers = [...new Set(busyIntervals.filter((b) => b.start < want.end && want.start < b.end).map((b) => b.label))];
    const withinHours = want.start >= hours.start && want.end <= hours.end;
    return { fits: withinHours && blockers.length === 0, freeWindows, blockers, dates: dates.length };
  }
  return { fits: freeWindows.length > 0, freeWindows, blockers: [], dates: dates.length };
}

export function describeWindows(windows: Window[]): string {
  return windows.map((w) => formatTimeRange(w.start, w.end)).join(", ");
}

/** One-line summary of what a query is looking for. */
export function describeQuery(q: SearchQuery, rangeEnd?: string): string {
  const parts: string[] = [];
  const kind = q.category === "Classroom" ? "classrooms" : q.category === "Conference Room" ? "conference rooms" : "rooms";
  parts.push(q.roomText ? `${kind} matching "${q.roomText}"` : q.category ? kind : "all rooms");
  if (q.minCapacity !== null) parts.push(`${q.minCapacity}+ seats`);
  if (q.date) parts.push(`on ${q.date}`);
  else if (q.days.length) parts.push(`every ${q.days.map((d) => d[0] + d.slice(1).toLowerCase()).join("/")}${rangeEnd ? ` through ${rangeEnd}` : ""}`);
  if (q.startMinute !== null) {
    parts.push(`${formatTimeRange(q.startMinute, q.startMinute + (q.duration ?? DEFAULT_DURATION))}`);
  } else if (q.duration !== null) {
    parts.push(`${q.duration}-minute slot`);
  }
  return parts.join(" · ");
}

function merge(intervals: Window[]): Window[] {
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  const out: Window[] = [];
  for (const i of sorted) {
    const last = out[out.length - 1];
    if (last && i.start <= last.end) last.end = Math.max(last.end, i.end);
    else out.push({ start: i.start, end: i.end });
  }
  return out;
}

function complement(busy: Window[], hours: Window): Window[] {
  const free: Window[] = [];
  let cursor = hours.start;
  for (const b of busy) {
    if (b.start > cursor) free.push({ start: cursor, end: Math.min(b.start, hours.end) });
    cursor = Math.max(cursor, b.end);
    if (cursor >= hours.end) break;
  }
  if (cursor < hours.end) free.push({ start: cursor, end: hours.end });
  return free.filter((w) => w.end > w.start);
}

function datesOn(days: Weekday[], from: string, to: string): string[] {
  const out: string[] = [];
  const d = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (d <= end) {
    const iso = d.toISOString().slice(0, 10);
    if (days.includes(weekdayOfDate(iso))) out.push(iso);
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

function weekdayOfDate(iso: string): Weekday {
  return (["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"] as const)[new Date(`${iso}T00:00:00Z`).getUTCDay()];
}
