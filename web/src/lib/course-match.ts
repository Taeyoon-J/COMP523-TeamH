// Department room calendars already hold an event for most course sections, titled like
// "COMP 523.001 - FB009 (Instructor A)". When 25Live gives us the same section, that calendar event is
// a mirror of the course, not a second booking, and must not count as a conflict.
import { normalizeRoomName, type Weekday } from "./scheduling";

const COURSE_TITLE = /^\s*COMP\s*(\d{2,3}[A-Z]?)(?:\.(\d{3}))?\s*-\s*([A-Z]{2})\s*-?\s*(\d{2,3})\b/i;

export interface CourseTitle {
  code: string; // "COMP 523"
  section: string | null; // "001", when the title has one
  room: string; // "FB009"
}

export function parseCourseTitle(title: string): CourseTitle | null {
  const m = COURSE_TITLE.exec(title);
  if (!m) return null;
  return { code: `COMP ${m[1].toUpperCase()}`, section: m[2] ?? null, room: normalizeRoomName(m[3] + m[4].padStart(3, "0")) };
}

interface Slot {
  roomName: string | null;
  days: Weekday[];
  startMinute: number;
  endMinute: number;
}

export interface CourseSlot extends Slot {
  code: string;
  section: string;
}

/** True when a calendar booking is the calendar's copy of one of these course meetings. */
export function isCourseMirror(booking: Slot & { title: string }, courses: CourseSlot[]): boolean {
  const parsed = parseCourseTitle(booking.title);
  if (!parsed) return false;
  return courses.some(
    (c) =>
      c.code === parsed.code &&
      (parsed.section === null || c.section === parsed.section) &&
      c.roomName === booking.roomName &&
      c.startMinute === booking.startMinute &&
      c.endMinute === booking.endMinute &&
      booking.days.some((d) => c.days.includes(d)),
  );
}
