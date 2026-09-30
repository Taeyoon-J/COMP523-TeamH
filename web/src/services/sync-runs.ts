import type { ExternalSystem } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/** Runs `fn` and records it as a SyncRun, so the UI can show when each system was last synced (I-8). */
export async function recordSync<T>(
  system: ExternalSystem,
  fn: () => Promise<T>,
  summarize: (result: T) => { ok: boolean; message: string },
): Promise<T> {
  const run = await prisma.syncRun.create({ data: { system } });
  try {
    const result = await fn();
    const { ok, message } = summarize(result);
    await prisma.syncRun.update({
      where: { id: run.id },
      data: { status: ok ? "SUCCESS" : "FAILED", message, finishedAt: new Date() },
    });
    return result;
  } catch (err) {
    await prisma.syncRun.update({
      where: { id: run.id },
      data: { status: "FAILED", message: (err as Error).message, finishedAt: new Date() },
    });
    throw err;
  }
}
