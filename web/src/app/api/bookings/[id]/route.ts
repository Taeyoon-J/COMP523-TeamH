import { adminAction } from "@/lib/api";
import { updateBooking } from "@/services/bookings";
import { BookingBody } from "../schema";

// PATCH /api/bookings/:id — change a booking made in this app
export async function PATCH(request: Request, ctx: RouteContext<"/api/bookings/[id]">) {
  const { id } = await ctx.params;
  return adminAction(request, BookingBody, ({ dryRun, ...input }, actor) => updateBooking(id, input, { actor, dryRun }));
}
