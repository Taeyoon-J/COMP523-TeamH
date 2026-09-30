// FR-2: which rooms are free for a given time.
import { prisma } from "@/lib/prisma";
import { meetingsConflict, type Weekday } from "@/lib/scheduling";
import { loadOccupants } from "./occupancy";

export interface AvailabilityQuery {
  days: Weekday[];
  startMinute: number;
  endMinute: number;
  startDate: Date;
  endDate: Date;
  minCapacity?: number;
}

/** Rooms with enough seats, free ones first (smallest first), each with what occupies it. */
export async function findAvailableRooms(query: AvailabilityQuery) {
  const [rooms, occupants] = await Promise.all([prisma.room.findMany(), loadOccupants()]);
  return rooms
    .filter((room) => room.capacity >= (query.minCapacity ?? 0))
    .map((room) => {
      const probe = { id: "__probe__", roomId: room.id, ...query };
      return { room, busyWith: occupants.filter((o) => meetingsConflict(probe, o)).map((o) => o.label) };
    })
    .sort((a, b) => Number(a.busyWith.length > 0) - Number(b.busyWith.length > 0) || a.room.capacity - b.room.capacity);
}

/** First and last day we have data for (courses and calendar reservations) — the default "every week" window. */
export async function termDates(): Promise<{ startDate: Date; endDate: Date }> {
  const [meetings, reservations] = await Promise.all([
    prisma.meeting.aggregate({ _min: { startDate: true }, _max: { endDate: true } }),
    prisma.roomReservation.aggregate({ _min: { startDate: true }, _max: { endDate: true } }),
  ]);
  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
  const starts = [meetings._min.startDate, reservations._min.startDate].filter((d) => d !== null);
  const ends = [meetings._max.endDate, reservations._max.endDate].filter((d) => d !== null);
  return {
    startDate: starts.length ? new Date(Math.min(...starts.map(Number))) : today,
    endDate: ends.length ? new Date(Math.max(...ends.map(Number))) : today,
  };
}
