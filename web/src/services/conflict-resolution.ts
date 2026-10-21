// Resolving a room conflict between two things booked at the same time:
//   keep one and move (courses) or cancel (bookings) the other, or
//   clear both and put a new booking in that slot.
import { assignMeeting } from "./assignments";
import { bookingConflicts, cancelBookings, createBooking, type BookingInput } from "./bookings";
import { ServiceError } from "./errors";
import { syncSheet, type SheetSyncResult } from "./sheet-sync";

/** One side of a conflict: a course meeting, or the clashing dates of a booking. */
export interface ConflictSide {
  kind: "course" | "reservation";
  ids: string[];
}

export type Resolution =
  | {
      action: "keep";
      keep: ConflictSide;
      other: ConflictSide;
      /** For a course on the other side: the room to move it to, or null to leave it without a room. */
      moveToRoomId?: string | null;
    }
  | { action: "replace"; sides: [ConflictSide, ConflictSide]; booking: BookingInput };

export interface ResolutionResult {
  summary: string[];
  sheetSync: SheetSyncResult;
}

export async function resolveConflict(resolution: Resolution, actor: string): Promise<ResolutionResult> {
  const summary: string[] = [];

  if (resolution.action === "keep") {
    await clear(resolution.other, actor, summary, resolution.moveToRoomId ?? null);
  } else {
    // Check the new booking first, ignoring what's about to be cleared, so nothing changes if it can't fit.
    const reservationIds = resolution.sides.filter((s) => s.kind === "reservation").flatMap((s) => s.ids);
    const meetingIds = resolution.sides.filter((s) => s.kind === "course").flatMap((s) => s.ids);
    const check = await bookingConflicts(resolution.booking, { ignoreReservationIds: reservationIds, ignoreMeetingIds: meetingIds });
    if (check.conflicts.length) {
      throw new ServiceError(`The new booking would still clash with ${check.conflicts.map((c) => c.with).join(", ")}.`, 409, { conflicts: check.conflicts });
    }
    for (const side of resolution.sides) await clear(side, actor, summary, null);
    const created = await createBooking(resolution.booking, { actor, syncSheet: false });
    summary.push(`Booked "${created.booking!.title}" in its place.`);
    if (created.calendarSync?.message) summary.push(created.calendarSync.message);
  }

  return { summary, sheetSync: await syncSheet() };
}

async function clear(side: ConflictSide, actor: string, summary: string[], moveToRoomId: string | null) {
  if (side.kind === "course") {
    const result = await assignMeeting(side.ids[0], { roomId: moveToRoomId }, { actor, syncSheet: false });
    summary.push(
      result.changes.length
        ? `Course room: ${result.changes.find((c) => c.field === "room")?.oldValue} → ${result.changes.find((c) => c.field === "room")?.newValue}.`
        : "Course left as it was.",
    );
    if (result.capacityIssue) summary.push(`Note: the new room seats ${result.capacityIssue.capacity}, the course expects ${result.capacityIssue.expectedEnrollment}.`);
    if (result.calendarSync?.message) summary.push(result.calendarSync.message);
  } else {
    const result = await cancelBookings(side.ids, { actor, syncSheet: false });
    summary.push(`Cancelled ${result.cancelled} booking date(s).`);
    if (result.calendarSync.message && result.calendarSync.message !== "Done.") summary.push(result.calendarSync.message);
  }
}
