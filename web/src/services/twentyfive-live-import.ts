// FR-9 / FR-10: pull rooms and course meetings from 25Live into our database.
import type { Room } from "@prisma/client";
import { getTwentyFiveLiveClient } from "@/integrations/twentyfive-live";
import { mapReservation, mapSpace } from "@/integrations/twentyfive-live/map";
import { prisma } from "@/lib/prisma";
import { configuredRooms } from "@/lib/rooms";
import { normalizeRoomName } from "@/lib/scheduling";
import { describeChanges } from "./changes";
import { courseLabel } from "./labels";
import { recordSync } from "./sync-runs";

export interface ImportResult {
  mode: string;
  rooms: number;
  created: string[];
  updated: string[];
  unchanged: number;
  /** Meetings an admin edited here; left alone unless `overwrite` is set. */
  keptLocal: string[];
  /** Meetings we imported before that 25Live no longer returns. Not deleted. */
  missing: string[];
  errors: string[];
}

export async function importFrom25Live(options: { term?: string; overwrite?: boolean } = {}): Promise<ImportResult> {
  const client = getTwentyFiveLiveClient();

  return recordSync(
    "TWENTYFIVE_LIVE",
    async () => {
      const [spaces, reservations] = await Promise.all([client.listSpaces(), client.listReservations(options.term)]);
      const result: ImportResult = { mode: client.mode, rooms: spaces.length, created: [], updated: [], unchanged: 0, keptLocal: [], missing: [], errors: [] };

      // Rooms are keyed by canonical name so 25Live and Google Calendar land on the same row.
      // Capacity comes from config/rooms.json when listed; 25Live only fills in rooms we don't know yet.
      const config = configuredRooms();
      const roomBySpace = new Map<number, Room>();
      for (const space of spaces) {
        const data = mapSpace(space);
        const name = normalizeRoomName(data.name);
        const configured = config.get(name);
        const room = await prisma.room.upsert({
          where: { name },
          create: { name, building: data.building, capacity: configured?.capacity ?? data.capacity, category: configured?.category ?? null },
          update: { building: data.building },
        });
        roomBySpace.set(space.space_id, room);
      }

      const seen: string[] = [];
      for (const raw of reservations) {
        let r;
        try {
          r = mapReservation(raw);
        } catch (err) {
          result.errors.push(`${raw.reservation_id}: ${(err as Error).message}`);
          continue;
        }
        seen.push(r.externalId);

        const courseKey = { term: r.term, code: r.code, section: r.section };
        const courseData = { title: r.title, instructorName: r.instructorName, expectedEnrollment: r.expectedEnrollment };
        const course = await prisma.course.upsert({
          where: { term_code_section: courseKey },
          create: { ...courseKey, ...courseData },
          update: courseData,
        });

        const room = r.spaceId != null ? (roomBySpace.get(r.spaceId) ?? null) : null;
        const slot = { roomId: room?.id ?? null, days: r.days, startMinute: r.startMinute, endMinute: r.endMinute, startDate: r.startDate, endDate: r.endDate };
        const label = courseLabel(course);
        const existing = await prisma.meeting.findUnique({ where: { externalId: r.externalId }, include: { room: true } });

        if (!existing) {
          await prisma.meeting.create({
            data: { ...slot, courseId: course.id, externalId: r.externalId, source: "TWENTYFIVE_LIVE", lastSyncedAt: new Date() },
          });
          result.created.push(label);
          continue;
        }
        if (existing.source === "LOCAL" && !options.overwrite) {
          result.keptLocal.push(label);
          continue;
        }

        const changes = describeChanges({ ...existing, roomName: existing.room?.name ?? null }, { ...slot, roomName: room?.name ?? null });
        await prisma.$transaction([
          prisma.changeLog.createMany({
            data: changes.map((c) => ({ ...c, meetingId: existing.id, changedBy: "25Live", source: "TWENTYFIVE_LIVE" as const })),
          }),
          prisma.meeting.update({
            where: { id: existing.id },
            data: { ...slot, courseId: course.id, source: "TWENTYFIVE_LIVE", lastSyncedAt: new Date() },
          }),
        ]);
        if (changes.length) result.updated.push(label);
        else result.unchanged++;
      }

      const stale = await prisma.meeting.findMany({
        where: { source: "TWENTYFIVE_LIVE", externalId: { notIn: seen }, ...(options.term ? { course: { term: options.term } } : {}) },
        include: { course: true },
      });
      result.missing = stale.map((m) => courseLabel(m.course));
      return result;
    },
    (r) => ({
      ok: r.errors.length === 0,
      message: `${r.created.length} created, ${r.updated.length} updated, ${r.unchanged} unchanged, ${r.keptLocal.length} kept local, ${r.errors.length} errors`,
    }),
  );
}
