// Pure scheduling rules (FR-5 conflict detection, FR-6 capacity validation).
// Kept free of database/framework code so it is easy to unit test.

export type Weekday = "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN";

export interface MeetingSlot {
  id: string;
  roomId: string | null;
  days: Weekday[];
  startMinute: number;
  endMinute: number;
  startDate: Date;
  endDate: Date;
}

export interface Conflict {
  meetingId: string;
  otherMeetingId: string;
  roomId: string;
  days: Weekday[];
}

export interface CapacityIssue {
  meetingId: string;
  roomId: string;
  capacity: number;
  expectedEnrollment: number;
}

/** Two meetings conflict when they share a room, a weekday, overlapping dates, and overlapping times. */
export function meetingsConflict(a: MeetingSlot, b: MeetingSlot): boolean {
  if (a.id === b.id || !a.roomId || a.roomId !== b.roomId) return false;
  if (!sharedDays(a, b).length) return false;
  const datesOverlap = a.startDate <= b.endDate && b.startDate <= a.endDate;
  const timesOverlap = a.startMinute < b.endMinute && b.startMinute < a.endMinute;
  return datesOverlap && timesOverlap;
}

/** Returns every conflicting pair, each reported once. */
export function findConflicts(meetings: MeetingSlot[]): Conflict[] {
  const conflicts: Conflict[] = [];
  for (let i = 0; i < meetings.length; i++) {
    for (let j = i + 1; j < meetings.length; j++) {
      const a = meetings[i];
      const b = meetings[j];
      if (meetingsConflict(a, b)) {
        conflicts.push({ meetingId: a.id, otherMeetingId: b.id, roomId: a.roomId!, days: sharedDays(a, b) });
      }
    }
  }
  return conflicts;
}

/** Conflicts that would exist if `proposed` replaced the meeting with the same id (FR-11 "what if"). */
export function conflictsForProposal(proposed: MeetingSlot, existing: MeetingSlot[]): Conflict[] {
  return existing
    .filter((m) => meetingsConflict(proposed, m))
    .map((m) => ({ meetingId: proposed.id, otherMeetingId: m.id, roomId: proposed.roomId!, days: sharedDays(proposed, m) }));
}

export function checkCapacity(
  meetingId: string,
  room: { id: string; capacity: number } | null,
  expectedEnrollment: number,
): CapacityIssue | null {
  if (!room || room.capacity >= expectedEnrollment) return null;
  return { meetingId, roomId: room.id, capacity: room.capacity, expectedEnrollment };
}

function sharedDays(a: MeetingSlot, b: MeetingSlot): Weekday[] {
  return a.days.filter((d) => b.days.includes(d));
}

/** 545 -> "9:05 AM" */
export function formatMinute(minute: number): string {
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  const suffix = h >= 12 ? "PM" : "AM";
  return `${((h + 11) % 12) + 1}:${m.toString().padStart(2, "0")} ${suffix}`;
}

export const WEEKDAYS: Weekday[] = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
const DAY_LETTER: Record<string, Weekday> = { M: "MON", T: "TUE", W: "WED", R: "THU", F: "FRI", S: "SAT", U: "SUN" };

/** Accepts registrar-style patterns ("MWF", "TR") or names ("MON,WED", "tue"). */
export function parseDayPattern(input: string): Weekday[] {
  const s = input.trim().toUpperCase();
  const days = /[,\s]/.test(s) || WEEKDAYS.includes(s as Weekday)
    ? s.split(/[,\s]+/).filter(Boolean).map((t) => (WEEKDAYS.includes(t as Weekday) ? (t as Weekday) : undefined))
    : [...s].map((c) => DAY_LETTER[c]);
  if (!days.length || days.some((d) => !d)) {
    throw new Error(`Can't read days "${input}". Use a pattern like MWF or TR, or names like MON,WED.`);
  }
  return WEEKDAYS.filter((d) => days.includes(d));
}

/** "9:05", "15:30", "3:30pm" -> minutes after midnight */
export function parseTime(input: string): number {
  const match = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i.exec(input.trim());
  if (!match) throw new Error(`Can't read time "${input}". Use HH:MM, e.g. 9:05 or 15:30.`);
  let hour = Number(match[1]);
  const minute = Number(match[2] ?? 0);
  const meridiem = match[3]?.toLowerCase();
  if (meridiem) {
    if (hour < 1 || hour > 12) throw new Error(`Can't read time "${input}".`);
    hour = (hour % 12) + (meridiem === "pm" ? 12 : 0);
  }
  if (hour > 23 || minute > 59) throw new Error(`Can't read time "${input}".`);
  return hour * 60 + minute;
}

/** ["MON","WED"] -> "Mon/Wed" */
export function formatDays(days: Weekday[]): string {
  return days.map((d) => d[0] + d.slice(1).toLowerCase()).join("/");
}

export function formatTimeRange(startMinute: number, endMinute: number): string {
  return `${formatMinute(startMinute)}–${formatMinute(endMinute)}`;
}

/** Canonical room name: no spaces/hyphens, upper case. "sn 011" and "SN-011" both become "SN011". */
export function normalizeRoomName(name: string): string {
  return name.replace(/[\s-]+/g, "").toUpperCase();
}

/** Date column values are stored as UTC midnight. */
export function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function weekdayOf(date: Date): Weekday {
  return (["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"] as const)[date.getUTCDay()];
}
