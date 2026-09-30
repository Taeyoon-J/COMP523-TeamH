import { z } from "zod";
import { requireAdmin } from "@/auth";
import { assignMeeting } from "@/services/assignments";
import { ServiceError } from "@/services/errors";

const Weekday = z.enum(["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]);

const Body = z
  .object({
    roomId: z.string().nullable().optional(),
    days: z.array(Weekday).min(1).optional(),
    startMinute: z.number().int().min(0).max(1439).optional(),
    endMinute: z.number().int().min(1).max(1440).optional(),
    /** When true, only report conflicts for the proposed change without saving (FR-11). */
    dryRun: z.boolean().optional(),
  })
  .strict();

// PATCH /api/meetings/:id — FR-4, FR-5, FR-6, FR-8
export async function PATCH(request: Request, ctx: RouteContext<"/api/meetings/[id]">) {
  const { id } = await ctx.params;
  const admin = await requireAdmin();
  if (!admin) return Response.json({ error: "Only authorized administrators can change assignments." }, { status: 403 });

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request", details: parsed.error.issues }, { status: 400 });
  const { dryRun, ...changes } = parsed.data;

  try {
    return Response.json(await assignMeeting(id, changes, { actor: admin, dryRun }));
  } catch (err) {
    if (err instanceof ServiceError) return Response.json({ error: err.message, details: err.details }, { status: err.status });
    throw err;
  }
}
