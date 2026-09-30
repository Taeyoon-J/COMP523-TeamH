import { requireAdmin } from "@/auth";
import { pullReservationsFromCalendar, pushAllToCalendar } from "@/services/google-calendar-sync";

// POST /api/sync/google  { "direction": "push" | "pull" } — FR-7, FR-9
export async function POST(request: Request) {
  if (!(await requireAdmin())) return Response.json({ error: "Only authorized administrators can sync." }, { status: 403 });
  const { direction = "push" } = await request.json().catch(() => ({}));
  try {
    return Response.json(direction === "pull" ? await pullReservationsFromCalendar() : await pushAllToCalendar());
  } catch (err) {
    return Response.json({ error: `Google Calendar sync failed: ${(err as Error).message}` }, { status: 502 });
  }
}
