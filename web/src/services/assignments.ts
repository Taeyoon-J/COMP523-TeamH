// FR-4 / FR-5 / FR-6 / FR-8 / FR-11: change a meeting's room or time.
import { prisma } from "@/lib/prisma";
import { checkCapacity, conflictsForProposal, type CapacityIssue, type Weekday } from "@/lib/scheduling";
import { describeChanges, type FieldChange } from "./changes";
import { ServiceError } from "./errors";
import { pushMeetingsToCalendar } from "./google-calendar-sync";
import { loadOccupants } from "./occupancy";

export interface AssignmentChanges {
  roomId?: string | null;
  days?: Weekday[];
  startMinute?: number;
  endMinute?: number;
}

export interface AssignmentResult {
  saved: boolean;
  changes: FieldChange[];
  conflicts: { with: string; days: Weekday[] }[];
  capacityIssue: CapacityIssue | null;
  calendarSync?: { ok: boolean; message: string };
}

/**
 * Checks a proposed change for conflicts and capacity, then (unless `dryRun`) saves it,
 * logs it, and pushes it to Google Calendar. Throws ServiceError with status 409 on conflict.
 */
export async function assignMeeting(
  meetingId: string,
  changes: AssignmentChanges,
  options: { actor: string; dryRun?: boolean; syncCalendar?: boolean },
): Promise<AssignmentResult> {
  const current = await prisma.meeting.findUnique({ where: { id: meetingId }, include: { course: true, room: true } });
  if (!current) throw new ServiceError("Meeting not found.", 404);

  const proposed = { ...current, ...changes };
  if (proposed.endMinute <= proposed.startMinute) throw new ServiceError("End time must be after start time.");
  const room = proposed.roomId ? await prisma.room.findUnique({ where: { id: proposed.roomId } }) : null;
  if (proposed.roomId && !room) throw new ServiceError("Room not found.");

  const occupants = proposed.roomId ? await loadOccupants({ roomId: proposed.roomId, excludeMeetingId: meetingId }) : [];
  const labelById = new Map(occupants.map((o) => [o.id, o.label]));
  const conflicts = conflictsForProposal(proposed, occupants).map((c) => ({ with: labelById.get(c.otherMeetingId)!, days: c.days }));
  const capacityIssue = checkCapacity(meetingId, room, current.course.expectedEnrollment);
  const fieldChanges = describeChanges({ ...current, roomName: current.room?.name ?? null }, { ...proposed, roomName: room?.name ?? null });
  const result: AssignmentResult = { saved: false, changes: fieldChanges, conflicts, capacityIssue };

  if (options.dryRun || !fieldChanges.length) return result;
  if (conflicts.length) throw new ServiceError("This change creates a room conflict.", 409, result);

  await prisma.$transaction([
    prisma.changeLog.createMany({ data: fieldChanges.map((c) => ({ ...c, meetingId, changedBy: options.actor })) }),
    // Once edited here, the meeting is local data: a 25Live import won't overwrite it without --overwrite.
    prisma.meeting.update({ where: { id: meetingId }, data: { ...changes, source: "LOCAL" } }),
  ]);
  result.saved = true;

  // The local save stands even if the calendar is unreachable (NFR-3); report it separately (NFR-5).
  if (options.syncCalendar !== false) {
    try {
      const push = await pushMeetingsToCalendar([meetingId]);
      result.calendarSync = push.failures.length
        ? { ok: false, message: push.failures[0] }
        : { ok: true, message: `${push.created.length ? "Created" : "Updated"} the Google Calendar event (${push.mode}).` };
    } catch (err) {
      result.calendarSync = { ok: false, message: `Saved, but the Google Calendar update failed: ${(err as Error).message}` };
    }
  }
  return result;
}
