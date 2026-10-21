import { z } from "zod";
import { adminAction } from "@/lib/api";
import { resolveConflict } from "@/services/conflict-resolution";
import { BookingBody } from "../../bookings/schema";

const Side = z.object({ kind: z.enum(["course", "reservation"]), ids: z.array(z.string()).min(1) });
const Resolution = z.discriminatedUnion("action", [
  z.object({ action: z.literal("keep"), keep: Side, other: Side, moveToRoomId: z.string().nullable().optional() }),
  z.object({ action: z.literal("replace"), sides: z.tuple([Side, Side]), booking: BookingBody.omit({ dryRun: true }) }),
]);

// POST /api/conflicts/resolve — keep one side, or replace both with a new booking
export async function POST(request: Request) {
  return adminAction(request, Resolution, (resolution, actor) => resolveConflict(resolution, actor));
}
