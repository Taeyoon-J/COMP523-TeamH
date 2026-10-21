import { z } from "zod";
import { adminAction } from "@/lib/api";
import { cancelBookings } from "@/services/bookings";

// POST /api/bookings/cancel { ids } — cancel bookings (one date or several)
export async function POST(request: Request) {
  return adminAction(request, z.object({ ids: z.array(z.string()).min(1) }), ({ ids }, actor) => cancelBookings(ids, { actor }));
}
