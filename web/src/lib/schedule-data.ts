import { courseLabel } from "@/services/labels";
import { loadOccupants } from "@/services/occupancy";
import { prisma } from "./prisma";
import { checkCapacity, findConflicts, formatTimeRange, WEEKDAYS, type MeetingSlot, type Weekday } from "./scheduling";

/** Everything the schedule views need, with conflicts and capacity issues precomputed and labeled. */
export async function getSchedule(term?: string) {
  const [rooms, meetings, reservations, occupants, lastSyncs] = await Promise.all([
    prisma.room.findMany({ orderBy: { name: "asc" } }),
    prisma.meeting.findMany({
      where: term ? { course: { term } } : undefined,
      include: { course: true, room: true },
      orderBy: [{ course: { code: "asc" } }, { startMinute: "asc" }],
    }),
    prisma.roomReservation.findMany({ include: { room: true }, orderBy: { startDate: "asc" } }),
    loadOccupants(),
    prisma.syncRun.findMany({ where: { status: "SUCCESS" }, orderBy: { finishedAt: "desc" }, distinct: ["system"] }),
  ]);

  const labelById = new Map(occupants.map((o) => [o.id, o.label]));
  const roomNameById = new Map(rooms.map((r) => [r.id, r.name]));

  const conflicts = findConflicts(occupants).map((c) => ({
    ...c,
    label: labelById.get(c.meetingId)!,
    otherLabel: labelById.get(c.otherMeetingId)!,
    roomName: roomNameById.get(c.roomId)!,
  }));
  const capacityIssues = meetings
    .map((m) => checkCapacity(m.id, m.room, m.course.expectedEnrollment))
    .filter((issue) => issue !== null)
    .map((issue) => ({ ...issue, label: labelById.get(issue.meetingId)!, roomName: roomNameById.get(issue.roomId)! }));
  const conflictGroups = groupConflicts(conflicts, new Map(occupants.map((o) => [o.id, o])));
  const unassigned = meetings.filter((m) => !m.roomId).map((m) => ({ meetingId: m.id, label: courseLabel(m.course) }));

  return { rooms, meetings, reservations, conflicts, conflictGroups, capacityIssues, unassigned, lastSyncs };
}

export interface ConflictGroup {
  roomName: string;
  label: string;
  otherLabel: string;
  time: string;
  days: Weekday[];
  /** Dates the two overlap; empty when both repeat weekly (they clash every week). */
  dates: Date[];
  /** Same title at the same time: most likely the same thing booked twice. */
  duplicate: boolean;
  meetingIds: string[];
}

/**
 * Calendar bookings are stored one row per date, so one recurring clash shows up once per week.
 * Collapse those into one entry per pair of bookings.
 */
function groupConflicts(
  conflicts: { meetingId: string; otherMeetingId: string; roomName: string; label: string; otherLabel: string; days: Weekday[] }[],
  byId: Map<string, MeetingSlot & { label: string }>,
): ConflictGroup[] {
  const groups = new Map<string, ConflictGroup>();
  for (const c of conflicts) {
    const a = byId.get(c.meetingId)!;
    const b = byId.get(c.otherMeetingId)!;
    const [first, second] = a.label <= b.label ? [a, b] : [b, a];
    const time = formatTimeRange(first.startMinute, first.endMinute);
    const key = [c.roomName, first.label, second.label, time].join("|");
    const group = groups.get(key) ?? {
      roomName: c.roomName,
      label: first.label,
      otherLabel: second.label,
      time,
      days: [],
      dates: [],
      duplicate: first.label === second.label && first.startMinute === second.startMinute && first.endMinute === second.endMinute,
      meetingIds: [],
    };
    group.days = WEEKDAYS.filter((d) => group.days.includes(d) || c.days.includes(d));
    const single = [a, b].find((x) => x.startDate.getTime() === x.endDate.getTime());
    if (single && !group.dates.some((d) => d.getTime() === single.startDate.getTime())) group.dates.push(single.startDate);
    group.meetingIds.push(a.id, b.id);
    groups.set(key, group);
  }
  return [...groups.values()]
    .map((g) => ({ ...g, dates: g.dates.sort((x, y) => x.getTime() - y.getTime()), meetingIds: [...new Set(g.meetingIds)] }))
    .sort((x, y) => Number(x.duplicate) - Number(y.duplicate) || x.roomName.localeCompare(y.roomName) || x.label.localeCompare(y.label));
}

export type ScheduleData = Awaited<ReturnType<typeof getSchedule>>;
