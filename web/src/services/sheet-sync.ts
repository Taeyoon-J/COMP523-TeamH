// Keeps the client's events spreadsheet in step with our schedule. Called after every change.
import { getSheetClient } from "@/integrations/google-sheets";
import { prisma } from "@/lib/prisma";
import { buildSheetRows } from "@/lib/sheet-rows";
import { courseLabel } from "./labels";
import { standaloneReservations } from "./occupancy";

export interface SheetSyncResult {
  ok: boolean;
  message: string;
}

/** Rewrites the spreadsheet from the database. Never throws: a failure is reported, the change stands. */
export async function syncSheet(): Promise<SheetSyncResult> {
  let client;
  try {
    client = getSheetClient();
  } catch (err) {
    return { ok: false, message: `Spreadsheet not updated: ${(err as Error).message}` };
  }
  if (!client) return { ok: true, message: "Spreadsheet sync is off." };

  try {
    const [meetings, reservations] = await Promise.all([
      prisma.meeting.findMany({ include: { course: true, room: true } }),
      prisma.roomReservation.findMany({ include: { room: true } }),
    ]);
    // Calendar copies of courses are listed once, as the course; cancelled bookings stay, marked.
    const active = new Set(standaloneReservations(reservations, meetings).map((r) => r.id));
    const bookings = reservations.filter((r) => active.has(r.id) || r.status === "CANCELLED");
    const rows = buildSheetRows(
      meetings.map((m) => ({
        id: m.externalId ?? m.id,
        label: `${courseLabel(m.course)} ${m.course.title}`,
        roomName: m.room?.name ?? null,
        days: m.days,
        startMinute: m.startMinute,
        endMinute: m.endMinute,
        startDate: m.startDate,
        endDate: m.endDate,
        enrollment: m.course.expectedEnrollment,
        instructor: m.course.instructorName,
        source: m.source,
        updatedAt: m.updatedAt,
      })),
      bookings.map((r) => ({
        externalId: r.externalId,
        title: r.title,
        roomName: r.room.name,
        days: r.days,
        startMinute: r.startMinute,
        endMinute: r.endMinute,
        startDate: r.startDate,
        endDate: r.endDate,
        description: r.description,
        organizer: r.organizer ?? r.createdBy,
        source: r.source,
        cancelled: r.status === "CANCELLED",
        updatedAt: r.updatedAt,
      })),
    );
    await client.writeTable(rows);
    return { ok: true, message: `Spreadsheet updated (${rows.length - 1} rows, ${client.mode}).` };
  } catch (err) {
    return { ok: false, message: `Spreadsheet not updated: ${(err as Error).message}` };
  }
}
