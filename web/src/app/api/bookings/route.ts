import { adminAction } from "@/lib/api";
import { createBooking } from "@/services/bookings";
import { BookingBody } from "./schema";

// POST /api/bookings — reserve a room
export async function POST(request: Request) {
  return adminAction(request, BookingBody, ({ dryRun, ...input }, actor) => createBooking(input, { actor, dryRun }));
}
