// FR-7 / FR-8: keep our data in step with the department's Google Calendars (one calendar per room).
//   pull: room calendars -> Room rows, and every event in them -> RoomReservation rows
//   push: write each course meeting as a weekly event on its room's calendar
//   diff: report where the calendars disagree with the schedule
import type { Prisma, Room } from "@prisma/client";
import { getCalendarClient, type CalendarClient } from "@/integrations/google-calendar";
import { eventDifferences, eventToSlot, managedKey, meetingToEvent, type CalendarEvent, type EventMeeting } from "@/lib/calendar-events";
import { prisma } from "@/lib/prisma";
import { configuredRooms, parseRoomCalendarName } from "@/lib/rooms";
import { ServiceError } from "./errors";
import { courseLabel } from "./labels";
import { recordSync } from "./sync-runs";

type MeetingWithCourse = Prisma.MeetingGetPayload<{ include: { course: true; room: true } }>;
type LocatedEvent = { calendarId: string; event: CalendarEvent };

/** Default pull window: Monday of this week through 16 weeks later. */
export function defaultWindow(): { from: Date; to: Date } {
  const from = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
  from.setUTCDate(from.getUTCDate() - ((from.getUTCDay() + 6) % 7));
  const to = new Date(from);
  to.setUTCDate(to.getUTCDate() + 16 * 7);
  return { from, to };
}

// ---------------------------------------------------------------------------------------------
// Rooms

export interface RoomSyncResult {
  rooms: { name: string; capacity: number; calendarCapacity: number; calendar: string }[];
  /** Rooms whose calendar says a different seat count than config/rooms.json. */
  capacityMismatches: { name: string; config: number; calendar: number }[];
  /** Rooms in config/rooms.json with no calendar visible to this account. */
  withoutCalendar: string[];
  /** Calendars that don't look like rooms (personal, holidays, ...). */
  otherCalendars: string[];
}

/** Creates/updates a Room for every calendar named like "FB009 seats 80". */
export async function syncRoomsFromCalendars(client: CalendarClient = getCalendarClient()): Promise<RoomSyncResult> {
  const config = configuredRooms();
  const result: RoomSyncResult = { rooms: [], capacityMismatches: [], withoutCalendar: [], otherCalendars: [] };
  const seen = new Set<string>();

  for (const cal of await client.listCalendars()) {
    const parsed = parseRoomCalendarName(cal.summary);
    if (!parsed) {
      result.otherCalendars.push(cal.summary);
      continue;
    }
    const configured = config.get(parsed.name);
    const capacity = configured?.capacity ?? parsed.capacity;
    if (configured && configured.capacity !== parsed.capacity) {
      result.capacityMismatches.push({ name: parsed.name, config: configured.capacity, calendar: parsed.capacity });
    }
    const data = { capacity, category: configured?.category ?? null, googleCalendarId: cal.id };
    await prisma.room.upsert({ where: { name: parsed.name }, create: { name: parsed.name, ...data }, update: data });
    result.rooms.push({ name: parsed.name, capacity, calendarCapacity: parsed.capacity, calendar: cal.summary });
    seen.add(parsed.name);
  }

  result.withoutCalendar = [...config.keys()].filter((name) => !seen.has(name));
  return result;
}

// ---------------------------------------------------------------------------------------------
// Pull

export interface PullResult {
  mode: string;
  rooms: RoomSyncResult;
  window: { from: Date; to: Date };
  reservations: number;
  perRoom: { room: string; count: number }[];
  /** Managed events (our own course events) are not counted here. */
  skipped: { title: string; reason: string }[];
}

export function pullReservationsFromCalendar(window = defaultWindow()): Promise<PullResult> {
  const client = getCalendarClient();

  return recordSync(
    "GOOGLE_CALENDAR",
    async () => {
      const rooms = await syncRoomsFromCalendars(client);
      const roomRows = await prisma.room.findMany({ where: { googleCalendarId: { not: null } }, orderBy: { name: "asc" } });
      const result: PullResult = { mode: client.mode, rooms, window, reservations: 0, perRoom: [], skipped: [] };
      const rows: Prisma.RoomReservationCreateManyInput[] = [];
      const now = new Date();

      for (const room of roomRows) {
        const events = await client.listEvents(room.googleCalendarId!, {
          expandRecurring: true,
          timeMin: window.from.toISOString(),
          timeMax: window.to.toISOString(),
        });
        let count = 0;
        for (const event of events) {
          if (managedKey(event) || !event.id || event.status === "cancelled") continue;
          const title = event.summary ?? "(untitled)";
          const slot = eventToSlot(event);
          if (!slot) {
            result.skipped.push({ title, reason: `${room.name}: all-day or multi-day event` });
            continue;
          }
          rows.push({ roomId: room.id, title, ...slot, source: "GOOGLE_CALENDAR", externalId: event.id, lastSyncedAt: now });
          count++;
        }
        result.perRoom.push({ room: room.name, count });
      }

      // Reservations are a mirror of the calendars, so replace them wholesale.
      await prisma.$transaction([
        prisma.roomReservation.deleteMany({ where: { source: "GOOGLE_CALENDAR" } }),
        prisma.roomReservation.createMany({ data: rows, skipDuplicates: true }),
      ]);
      result.reservations = rows.length;
      return result;
    },
    (r) => ({ ok: true, message: `pull: ${r.rooms.rooms.length} rooms, ${r.reservations} reservations, ${r.skipped.length} skipped` }),
  );
}

// ---------------------------------------------------------------------------------------------
// Push

function scheduleKey(m: { id: string; externalId: string | null }): string {
  return m.externalId ?? m.id;
}

function toEventMeeting(m: MeetingWithCourse): EventMeeting {
  return {
    key: scheduleKey(m),
    days: m.days,
    startMinute: m.startMinute,
    endMinute: m.endMinute,
    startDate: m.startDate,
    endDate: m.endDate,
    courseCode: m.course.code,
    section: m.course.section,
    title: m.course.title,
    roomName: m.room?.name ?? null,
    instructorName: m.course.instructorName,
  };
}

/** Our own events on every room calendar. */
async function listManagedEvents(client: CalendarClient, rooms: Room[]): Promise<LocatedEvent[]> {
  const lists = await Promise.all(
    rooms
      .filter((r) => r.googleCalendarId)
      .map(async (r) => (await client.listEvents(r.googleCalendarId!, { managedOnly: true })).map((event) => ({ calendarId: r.googleCalendarId!, event }))),
  );
  return lists.flat();
}

function findEventFor(m: MeetingWithCourse, events: LocatedEvent[]): LocatedEvent | undefined {
  const key = scheduleKey(m);
  return (m.googleEventId ? events.find((e) => e.event.id === m.googleEventId) : undefined) ?? events.find((e) => managedKey(e.event) === key);
}

export interface PushResult {
  mode: string;
  created: string[];
  updated: string[];
  /** Moved to a different room's calendar. */
  moved: string[];
  removed: string[];
  unchanged: number;
  skipped: string[];
  failures: string[];
}

/** Creates, updates, or moves the event on the room calendar for each meeting (all meetings if omitted). */
export async function pushMeetingsToCalendar(meetingIds?: string[]): Promise<PushResult> {
  const client = getCalendarClient();
  if (!client.canWrite) {
    throw new ServiceError("Writing to Google Calendar is turned off (GOOGLE_CALENDAR_WRITE is not true).");
  }
  const rooms = await prisma.room.findMany();
  const [meetings, managed] = await Promise.all([
    prisma.meeting.findMany({ where: meetingIds ? { id: { in: meetingIds } } : undefined, include: { course: true, room: true } }),
    listManagedEvents(client, rooms),
  ]);
  const result: PushResult = { mode: client.mode, created: [], updated: [], moved: [], removed: [], unchanged: 0, skipped: [], failures: [] };

  for (const m of meetings) {
    const label = courseLabel(m.course);
    const target = m.room?.googleCalendarId ?? null;
    const existing = findEventFor(m, managed);
    const desired = meetingToEvent(toEventMeeting(m));
    try {
      let eventId: string | null | undefined = existing?.event.id;
      if (!target) {
        if (existing) {
          await client.deleteEvent(existing.calendarId, existing.event.id!);
          result.removed.push(label);
        } else {
          result.skipped.push(`${label}: ${m.room ? `${m.room.name} has no calendar` : "no room"}`);
        }
        eventId = null;
      } else if (existing && existing.calendarId !== target) {
        await client.deleteEvent(existing.calendarId, existing.event.id!);
        eventId = (await client.insertEvent(target, desired)).id;
        result.moved.push(label);
      } else if (!existing) {
        eventId = (await client.insertEvent(target, desired)).id;
        result.created.push(label);
      } else if (eventDifferences(existing.event, desired).length) {
        eventId = (await client.updateEvent(target, existing.event.id!, desired)).id;
        result.updated.push(label);
      } else {
        result.unchanged++;
      }
      await prisma.meeting.update({ where: { id: m.id }, data: { googleEventId: eventId ?? null, lastSyncedAt: new Date() } });
    } catch (err) {
      result.failures.push(`${label}: ${(err as Error).message}`);
    }
  }
  return result;
}

export function pushAllToCalendar(): Promise<PushResult> {
  return recordSync("GOOGLE_CALENDAR", () => pushMeetingsToCalendar(), (r) => ({
    ok: r.failures.length === 0,
    message: `push: ${r.created.length} created, ${r.updated.length} updated, ${r.moved.length} moved, ${r.unchanged} unchanged, ${r.failures.length} failed`,
  }));
}

// ---------------------------------------------------------------------------------------------
// Diff / listing

export interface CalendarDiff {
  mode: string;
  meetings: {
    label: string;
    status: "in sync" | "missing" | "outdated" | "wrong room" | "no calendar";
    differences: ReturnType<typeof eventDifferences>;
  }[];
  /** Events we created whose meeting no longer exists. */
  orphaned: string[];
}

export async function diffCalendar(): Promise<CalendarDiff> {
  const client = getCalendarClient();
  const rooms = await prisma.room.findMany();
  const [meetings, managed] = await Promise.all([
    prisma.meeting.findMany({ include: { course: true, room: true }, orderBy: { course: { code: "asc" } } }),
    listManagedEvents(client, rooms),
  ]);
  const roomByCalendar = new Map(rooms.map((r) => [r.googleCalendarId, r.name]));
  const keys = new Set(meetings.map(scheduleKey));

  return {
    mode: client.mode,
    meetings: meetings.map((m) => {
      const label = courseLabel(m.course);
      const target = m.room?.googleCalendarId;
      const actual = findEventFor(m, managed);
      if (!target) return { label, status: "no calendar" as const, differences: [] };
      if (!actual) return { label, status: "missing" as const, differences: [] };
      if (actual.calendarId !== target) {
        const on = roomByCalendar.get(actual.calendarId) ?? actual.calendarId;
        return { label, status: "wrong room" as const, differences: [{ field: "room", actual: on, expected: m.room!.name }] };
      }
      const differences = eventDifferences(actual.event, meetingToEvent(toEventMeeting(m)));
      return { label, status: differences.length ? ("outdated" as const) : ("in sync" as const), differences };
    }),
    orphaned: managed.filter((e) => !keys.has(managedKey(e.event)!)).map((e) => e.event.summary ?? e.event.id ?? "?"),
  };
}

/** Events on the room calendars in a window, for display. */
export async function listCalendarEvents(options: { room?: string; window?: { from: Date; to: Date } } = {}) {
  const client = getCalendarClient();
  const window = options.window ?? defaultWindow();
  const rooms = await prisma.room.findMany({
    where: { googleCalendarId: { not: null }, ...(options.room ? { name: options.room } : {}) },
    orderBy: { name: "asc" },
  });
  const perRoom = await Promise.all(
    rooms.map(async (room) => ({
      room: room.name,
      events: await client.listEvents(room.googleCalendarId!, {
        expandRecurring: true,
        timeMin: window.from.toISOString(),
        timeMax: window.to.toISOString(),
      }),
    })),
  );
  return { mode: client.mode, window, perRoom };
}
