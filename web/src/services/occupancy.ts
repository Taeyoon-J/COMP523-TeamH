import { prisma } from "@/lib/prisma";
import type { MeetingSlot } from "@/lib/scheduling";
import { courseLabel } from "./labels";

export interface Occupant extends MeetingSlot {
  label: string;
  kind: "course" | "reservation";
}

/** Everything that takes up room time: course meetings and calendar reservations. */
export async function loadOccupants(where: { roomId?: string; excludeMeetingId?: string } = {}): Promise<Occupant[]> {
  const [meetings, reservations] = await Promise.all([
    prisma.meeting.findMany({
      where: {
        roomId: where.roomId ?? { not: null },
        ...(where.excludeMeetingId ? { id: { not: where.excludeMeetingId } } : {}),
      },
      include: { course: true },
    }),
    prisma.roomReservation.findMany({ where: where.roomId ? { roomId: where.roomId } : undefined }),
  ]);
  return [
    ...meetings.map((m) => ({ ...m, label: courseLabel(m.course), kind: "course" as const })),
    ...reservations.map((r) => ({ ...r, label: r.title, kind: "reservation" as const })),
  ];
}
