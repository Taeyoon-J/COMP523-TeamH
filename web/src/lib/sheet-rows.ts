// Rows for the client's events spreadsheet: one row per course meeting or booking series.
import { formatDays, formatMinute, toDateString, WEEKDAYS, type Weekday } from "./scheduling";

export const SHEET_COLUMNS = [
  "Event ID",
  "Type",
  "Title",
  "Room",
  "Days",
  "Dates",
  "Start",
  "End",
  "Description",
  "Booked by / Instructor",
  "Source",
  "Status",
  "Last updated",
];

export interface SheetCourse {
  id: string;
  label: string; // "COMP 523-001 Software Engineering Laboratory"
  roomName: string | null;
  days: Weekday[];
  startMinute: number;
  endMinute: number;
  startDate: Date;
  endDate: Date;
  enrollment: number;
  instructor: string | null;
  source: string;
  updatedAt: Date;
}

export interface SheetBooking {
  /** Google event ID (one per occurrence for repeating events) or our own local ID. */
  externalId: string;
  title: string;
  roomName: string;
  days: Weekday[];
  startMinute: number;
  endMinute: number;
  startDate: Date;
  endDate: Date;
  description: string | null;
  organizer: string | null;
  source: string;
  cancelled: boolean;
  updatedAt: Date;
}

const SOURCE: Record<string, string> = { LOCAL: "This app", TWENTYFIVE_LIVE: "25Live", GOOGLE_CALENDAR: "Google Calendar" };

/** Google gives each occurrence of a repeating event an ID like "<series>_20261005T130000Z". */
export function seriesId(externalId: string): string {
  return externalId.replace(/_\d{8}(T\d{6}Z?)?$/, "");
}

export function buildSheetRows(courses: SheetCourse[], bookings: SheetBooking[]): string[][] {
  const rows: { sort: string; cells: string[] }[] = [];

  for (const c of courses) {
    rows.push({
      sort: `${c.roomName ?? "~"}|${String(c.startMinute).padStart(4, "0")}|${c.label}`,
      cells: [
        c.id,
        "Course",
        c.label,
        c.roomName ?? "",
        formatDays(c.days),
        dateRange(c.startDate, c.endDate),
        formatMinute(c.startMinute),
        formatMinute(c.endMinute),
        `Expected enrollment: ${c.enrollment}`,
        c.instructor ?? "",
        SOURCE[c.source] ?? c.source,
        "Scheduled",
        c.updatedAt.toISOString(),
      ],
    });
  }

  // Merge the occurrences of one repeating event into a single row.
  const series = new Map<string, SheetBooking & { dayset: Set<Weekday> }>();
  for (const b of bookings) {
    const key = [b.roomName, seriesId(b.externalId), b.startMinute, b.endMinute, b.title, b.cancelled].join("|");
    const s = series.get(key);
    if (!s) {
      series.set(key, { ...b, externalId: seriesId(b.externalId), dayset: new Set(b.days) });
      continue;
    }
    b.days.forEach((d) => s.dayset.add(d));
    if (b.startDate < s.startDate) s.startDate = b.startDate;
    if (b.endDate > s.endDate) s.endDate = b.endDate;
    if (b.updatedAt > s.updatedAt) s.updatedAt = b.updatedAt;
  }
  for (const b of series.values()) {
    rows.push({
      sort: `${b.roomName}|${String(b.startMinute).padStart(4, "0")}|${b.title}`,
      cells: [
        b.externalId,
        "Booking",
        b.title,
        b.roomName,
        formatDays(WEEKDAYS.filter((d) => b.dayset.has(d))),
        dateRange(b.startDate, b.endDate),
        formatMinute(b.startMinute),
        formatMinute(b.endMinute),
        b.description ?? "",
        b.organizer ?? "",
        SOURCE[b.source] ?? b.source,
        b.cancelled ? "Cancelled" : "Active",
        b.updatedAt.toISOString(),
      ],
    });
  }

  return [SHEET_COLUMNS, ...rows.sort((a, b) => a.sort.localeCompare(b.sort)).map((r) => r.cells)];
}

export function toCsv(rows: string[][]): string {
  const cell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return rows.map((r) => r.map(cell).join(",")).join("\n") + "\n";
}

function dateRange(start: Date, end: Date): string {
  const a = toDateString(start);
  const b = toDateString(end);
  return a === b ? a : `${a} – ${b}`;
}
