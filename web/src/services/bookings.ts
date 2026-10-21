// Room bookings made in this app (and cancelling bookings that came from Google Calendar).
// Every change is logged, written to the events spreadsheet, and, when GOOGLE_CALENDAR_WRITE=true,
// to the room's Google Calendar. Bookings made by other people are never deleted from Google.
import { randomUUID } from "node:crypto";
import type { RoomReservation } from "@prisma/client";
import { getCalendarClient } from "@/integrations/google-calendar";
import { BOOKING_KEY_PREFIX, bookingToEvent } from "@/lib/calendar-events";
import { prisma } from "@/lib/prisma";
import { conflictsForProposal, formatDays, formatTimeRange, toDateString, weekdayOf, type Weekday } from "@/lib/scheduling";
import { ServiceError } from "./errors";
import { loadOccupants } from "./occupancy";
import { syncSheet, type SheetSyncResult } from "./sheet-sync";

export interface BookingInput {
  roomId: string;
  title: string;
  description?: string | null;
  /** YYYY-MM-DD. */
  startDate: string;
  /** YYYY-MM-DD; later than startDate makes it weekly on `days` through this date. */
  endDate?: string | null;
  /** Weekdays for a repeating booking; defaults to the weekday of startDate. */
  days?: Weekday[];
  startMinute: number;
  endMinute: number;
}

export interface BookingConflict {
  with: string;
  days: Weekday[];
}

export interface BookingResult {
  booking: RoomReservation | null;
  conflicts: BookingConflict[];
  calendarSync?: { ok: boolean; message: string };
  sheetSync?: SheetSyncResult;
}

interface Options {
  actor: string;
  /** Only check for conflicts. */
  dryRun?: boolean;
  /** Bookings to leave out of the conflict check (e.g. the one being edited, or ones about to be cancelled). */
  ignoreReservationIds?: string[];
  ignoreMeetingIds?: string[];
  /** Callers that make several changes write the spreadsheet once at the end. */
  syncSheet?: boolean;
}

function normalize(input: BookingInput) {
  const title = input.title.trim();
  if (!title) throw new ServiceError("Give the booking a title.");
  if (input.endMinute <= input.startMinute) throw new ServiceError("End time must be after start time.");
  const startDate = new Date(`${input.startDate}T00:00:00Z`);
  const endDate = new Date(`${input.endDate || input.startDate}T00:00:00Z`);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) throw new ServiceError("Dates must look like 2026-10-21.");
  if (endDate < startDate) throw new ServiceError("The last date can't be before the first date.");
  const repeating = endDate > startDate;
  const days = repeating && input.days?.length ? input.days : [weekdayOf(startDate)];
  return { ...input, title, description: input.description?.trim() || null, startDate, endDate, days };
}

/** What a proposed booking would clash with. */
export async function bookingConflicts(input: BookingInput, options: Pick<Options, "ignoreReservationIds" | "ignoreMeetingIds"> = {}) {
  const b = normalize(input);
  const room = await prisma.room.findUnique({ where: { id: b.roomId } });
  if (!room) throw new ServiceError("Room not found.");
  const occupants = await loadOccupants({ roomId: b.roomId, excludeReservationIds: options.ignoreReservationIds, excludeMeetingIds: options.ignoreMeetingIds });
  const labels = new Map(occupants.map((o) => [o.id, o.label]));
  const conflicts = conflictsForProposal({ ...b, id: "__new__" }, occupants).map((c) => ({ with: labels.get(c.otherMeetingId)!, days: c.days }));
  // One line per clashing booking, not per date.
  const unique = [...new Map(conflicts.map((c) => [c.with, c])).values()];
  return { booking: b, room, conflicts: unique };
}

export async function createBooking(input: BookingInput, options: Options): Promise<BookingResult> {
  const { booking: b, room, conflicts } = await bookingConflicts(input, options);
  if (options.dryRun) return { booking: null, conflicts };
  if (conflicts.length) throw new ServiceError(`${room.name} is already booked then.`, 409, { conflicts });

  const id = randomUUID();
  const created = await prisma.roomReservation.create({
    data: {
      roomId: b.roomId,
      title: b.title,
      description: b.description,
      organizer: options.actor,
      createdBy: options.actor,
      days: b.days,
      startMinute: b.startMinute,
      endMinute: b.endMinute,
      startDate: b.startDate,
      endDate: b.endDate,
      source: "LOCAL",
      externalId: `local-${id}`,
      changes: { create: { field: "booking", oldValue: null, newValue: describe(b, room.name), changedBy: options.actor } },
    },
  });
  const result: BookingResult = { booking: created, conflicts: [] };
  result.calendarSync = await writeToCalendar(created.id);
  if (options.syncSheet !== false) result.sheetSync = await syncSheet();
  return result;
}

/** Changes a booking made in this app. Bookings from Google Calendar can only be cancelled here. */
export async function updateBooking(id: string, input: BookingInput, options: Options): Promise<BookingResult> {
  const current = await prisma.roomReservation.findUnique({ where: { id }, include: { room: true } });
  if (!current) throw new ServiceError("Booking not found.", 404);
  if (current.source !== "LOCAL") throw new ServiceError("This booking comes from Google Calendar. Change it there, or cancel it here.");
  if (current.status === "CANCELLED") throw new ServiceError("This booking is cancelled.");

  const { booking: b, room, conflicts } = await bookingConflicts(input, { ...options, ignoreReservationIds: [id, ...(options.ignoreReservationIds ?? [])] });
  if (options.dryRun) return { booking: null, conflicts };
  if (conflicts.length) throw new ServiceError(`${room.name} is already booked then.`, 409, { conflicts });

  const before = describe(current, current.room.name);
  const after = describe(b, room.name);
  const updated = await prisma.roomReservation.update({
    where: { id },
    data: {
      roomId: b.roomId,
      title: b.title,
      description: b.description,
      days: b.days,
      startMinute: b.startMinute,
      endMinute: b.endMinute,
      startDate: b.startDate,
      endDate: b.endDate,
      ...(before !== after ? { changes: { create: { field: "booking", oldValue: before, newValue: after, changedBy: options.actor } } } : {}),
    },
  });
  const result: BookingResult = { booking: updated, conflicts: [] };
  result.calendarSync = await writeToCalendar(id, current.room.googleCalendarId);
  if (options.syncSheet !== false) result.sheetSync = await syncSheet();
  return result;
}

/** Cancels one or more bookings (e.g. every clashing date of a repeating booking). */
export async function cancelBookings(ids: string[], options: Options): Promise<{ cancelled: number; calendarSync: { ok: boolean; message: string }; sheetSync?: SheetSyncResult }> {
  const rows = await prisma.roomReservation.findMany({ where: { id: { in: ids }, status: "ACTIVE" }, include: { room: true } });
  if (!rows.length) throw new ServiceError("Nothing to cancel: those bookings are already cancelled or gone.", 404);

  await prisma.$transaction(
    rows.map((r) =>
      prisma.roomReservation.update({
        where: { id: r.id },
        data: { status: "CANCELLED", changes: { create: { field: "status", oldValue: "Active", newValue: "Cancelled", changedBy: options.actor } } },
      }),
    ),
  );

  const local = rows.filter((r) => r.source === "LOCAL");
  const fromGoogle = rows.length - local.length;
  const messages: string[] = [];
  for (const r of local) {
    const sync = await writeToCalendar(r.id);
    if (!sync.ok) messages.push(sync.message);
  }
  if (fromGoogle) messages.push(`${fromGoogle} Google Calendar booking(s) cancelled in this app only; the event in Google Calendar belongs to someone else and was not changed.`);
  const result = { cancelled: rows.length, calendarSync: { ok: messages.length === 0, message: messages.join(" ") || "Done." } };
  return options.syncSheet !== false ? { ...result, sheetSync: await syncSheet() } : result;
}

/**
 * Creates, updates or deletes this app's event for a local booking. Only touches events this app
 * created, and only when calendar writes are on.
 */
async function writeToCalendar(id: string, previousCalendarId?: string | null): Promise<{ ok: boolean; message: string }> {
  const r = await prisma.roomReservation.findUnique({ where: { id }, include: { room: true } });
  if (!r || r.source !== "LOCAL") return { ok: true, message: "" };
  let client;
  try {
    client = getCalendarClient();
  } catch (err) {
    return { ok: false, message: `Saved here; Google Calendar not updated: ${(err as Error).message}` };
  }
  if (!client.canWrite) return { ok: true, message: "Saved here. Google Calendar writes are off, so the room calendar was not changed." };
  const calendarId = r.room.googleCalendarId;

  try {
    // Moved to another room, or cancelled: remove the old event first.
    const oldCalendar = previousCalendarId ?? calendarId;
    if (r.googleEventId && oldCalendar && (r.status === "CANCELLED" || oldCalendar !== calendarId)) {
      await client.deleteEvent(oldCalendar, r.googleEventId);
      await prisma.roomReservation.update({ where: { id }, data: { googleEventId: null } });
      if (r.status === "CANCELLED") return { ok: true, message: `Removed from ${r.room.name}'s Google Calendar (${client.mode}).` };
    }
    if (r.status === "CANCELLED") return { ok: true, message: "" };
    if (!calendarId) return { ok: true, message: `${r.room.name} has no Google Calendar, so only this app has the booking.` };

    const event = bookingToEvent({ key: `${BOOKING_KEY_PREFIX}${r.id}`, title: r.title, description: r.description, roomName: r.room.name, days: r.days, startMinute: r.startMinute, endMinute: r.endMinute, startDate: r.startDate, endDate: r.endDate });
    const stillThere = r.googleEventId && oldCalendar === calendarId;
    const saved = stillThere ? await client.updateEvent(calendarId, r.googleEventId!, event) : await client.insertEvent(calendarId, event);
    await prisma.roomReservation.update({ where: { id }, data: { googleEventId: saved.id ?? null, lastSyncedAt: new Date() } });
    return { ok: true, message: `${stillThere ? "Updated" : "Added to"} ${r.room.name}'s Google Calendar (${client.mode}).` };
  } catch (err) {
    return { ok: false, message: `Saved here; Google Calendar not updated: ${(err as Error).message}` };
  }
}

function describe(b: { title: string; days: Weekday[]; startMinute: number; endMinute: number; startDate: Date; endDate: Date }, room: string): string {
  const a = toDateString(b.startDate);
  const z = toDateString(b.endDate);
  const when = a === z ? a : `${formatDays(b.days)} ${a} – ${z}`;
  return `${b.title} · ${room} · ${when} · ${formatTimeRange(b.startMinute, b.endMinute)}`;
}
