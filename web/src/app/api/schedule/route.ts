import { getSchedule } from "@/lib/schedule-data";

// GET /api/schedule?term=2026FA — FR-1, FR-3, FR-5, FR-6
export async function GET(request: Request) {
  const term = new URL(request.url).searchParams.get("term") ?? undefined;
  return Response.json(await getSchedule(term));
}
