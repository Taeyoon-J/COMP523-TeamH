import { resetMockCalendar } from "@/integrations/google-calendar";
import { prisma } from "@/lib/prisma";

/** Deletes all local data and the mock calendar's saved state. */
export async function resetAll(): Promise<void> {
  await prisma.$transaction([
    prisma.changeLog.deleteMany(),
    prisma.roomReservation.deleteMany(),
    prisma.meeting.deleteMany(),
    prisma.course.deleteMany(),
    prisma.room.deleteMany(),
    prisma.syncRun.deleteMany(),
  ]);
  resetMockCalendar();
}
