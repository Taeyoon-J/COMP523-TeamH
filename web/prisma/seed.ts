// `npm run db:seed`: wipe local data and reload from Google Calendar and 25Live (mock or live, per .env).
import { prisma } from "../src/lib/prisma";
import { pullReservationsFromCalendar } from "../src/services/google-calendar-sync";
import { resetAll } from "../src/services/reset";
import { twentyFiveLiveEnabled } from "../src/integrations/twentyfive-live";
import { importFrom25Live } from "../src/services/twentyfive-live-import";

async function main() {
  await resetAll();
  const pulled = await pullReservationsFromCalendar();
  const imported = twentyFiveLiveEnabled() ? await importFrom25Live() : null;
  console.log(
    `Seeded ${pulled.rooms.rooms.length} rooms, ${pulled.reservations} room reservations, ${imported?.created.length ?? 0} course meetings.`,
  );
}

main().finally(() => prisma.$disconnect());
