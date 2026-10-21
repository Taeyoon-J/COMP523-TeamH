import type { z } from "zod";
import { requireAdmin } from "@/auth";
import { ServiceError } from "@/services/errors";

/** Runs an admin-only API action: checks sign-in, validates the body, and turns ServiceErrors into JSON. */
export async function adminAction<T extends z.ZodType>(request: Request, schema: T, run: (body: z.infer<T>, actor: string) => Promise<unknown>) {
  const actor = await requireAdmin();
  if (!actor) return Response.json({ error: "Only authorized administrators can change bookings." }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request", details: parsed.error.issues }, { status: 400 });
  try {
    return Response.json(await run(parsed.data, actor));
  } catch (err) {
    if (err instanceof ServiceError) return Response.json({ error: err.message, details: err.details }, { status: err.status });
    throw err;
  }
}
