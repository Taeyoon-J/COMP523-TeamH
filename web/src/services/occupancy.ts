import type { Course, Meeting, Room, RoomReservation } from "@prisma/client";
import { isCourseMirror, type CourseSlot } from "@/lib/course-match";
import { prisma } from "@/lib/prisma";
import { seriesId } from "@/lib/sheet-rows";
import type { MeetingSlot } from "@/lib/scheduling";
import { courseLabel } from "./labels";

export interface Occupant extends MeetingSlot {
  label: string;
  kind: "course" | "reservation";
  /** Same for every date of one repeating booking; the meeting ID for courses. */
  seriesKey: string;
}

type MeetingRow = Meeting & { course: Course; room: Room | null };
type ReservationRow = RoomReservation & { room: Room };

/**
 * Calendar bookings that count as their own booking: not cancelled, and not the calendar's copy of a
 * course we already have from 25Live (that would make every course clash with itself).
 */
export function standaloneReservations<R extends ReservationRow>(reservations: R[], meetings: MeetingRow[]): R[] {
  const courses: CourseSlot[] = meetings.map((m) => ({
    code: m.course.code,
    section: m.course.section,
    roomName: m.room?.name ?? null,
    days: m.days,
    startMinute: m.startMinute,
    endMinute: m.endMinute,
  }));
  return reservations.filter((r) => r.status === "ACTIVE" && !isCourseMirror({ ...r, roomName: r.room.name }, courses));
}

/** Everything that takes up room time: course meetings and standalone room bookings. */
export async function loadOccupants(
  where: { roomId?: string; excludeMeetingId?: string; excludeMeetingIds?: string[]; excludeReservationIds?: string[] } = {},
): Promise<Occupant[]> {
  const [meetings, reservations] = await Promise.all([
    prisma.meeting.findMany({ where: { roomId: where.roomId ?? { not: null } }, include: { course: true, room: true } }),
    prisma.roomReservation.findMany({ where: where.roomId ? { roomId: where.roomId } : undefined, include: { room: true } }),
  ]);
  const excluded = new Set(where.excludeReservationIds ?? []);
  const excludedMeetings = new Set([...(where.excludeMeetingIds ?? []), ...(where.excludeMeetingId ? [where.excludeMeetingId] : [])]);
  return [
    ...meetings.filter((m) => !excludedMeetings.has(m.id)).map((m) => ({ ...m, label: courseLabel(m.course), kind: "course" as const, seriesKey: m.id })),
    ...standaloneReservations(reservations, meetings)
      .filter((r) => !excluded.has(r.id))
      .map((r) => ({ ...r, label: r.title, kind: "reservation" as const, seriesKey: `${r.roomId}|${seriesId(r.externalId)}` })),
  ];
}
