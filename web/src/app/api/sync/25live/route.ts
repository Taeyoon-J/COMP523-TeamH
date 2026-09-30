import { requireAdmin } from "@/auth";
import { importFrom25Live } from "@/services/twentyfive-live-import";

// POST /api/sync/25live  { "overwrite"?: boolean } — FR-9, FR-10
export async function POST(request: Request) {
  if (!(await requireAdmin())) return Response.json({ error: "Only authorized administrators can sync." }, { status: 403 });
  const { overwrite = false } = await request.json().catch(() => ({}));
  try {
    return Response.json(await importFrom25Live({ overwrite }));
  } catch (err) {
    return Response.json({ error: `25Live import failed: ${(err as Error).message}` }, { status: 502 });
  }
}
