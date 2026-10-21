"use client";

import type { ConflictGroup } from "@/lib/schedule-data";

export interface CapacityProblem {
  meetingId: string;
  label: string;
  roomName: string;
  capacity: number;
  expectedEnrollment: number;
}

/** Conflicts and rooms that are too small (FR-5, FR-6), each conflict with a Resolve button. */
export default function ProblemsPanel({
  conflicts,
  capacityIssues,
  canEdit,
  onResolve,
}: {
  conflicts: ConflictGroup[];
  capacityIssues: CapacityProblem[];
  canEdit: boolean;
  onResolve: (group: ConflictGroup) => void;
}) {
  if (!conflicts.length && !capacityIssues.length) return null;
  return (
    <section className="space-y-2 rounded border border-red-300 bg-red-50 p-4 text-sm text-red-900">
      <h2 className="font-semibold">
        Problems ({conflicts.length + capacityIssues.length})
      </h2>
      <ul className="space-y-1.5">
        {conflicts.map((g) => (
          <li key={g.key} className="flex flex-wrap items-center justify-between gap-2">
            <span>
              {g.duplicate ? `Booked twice in ${g.roomName}: ${g.label}` : `Room conflict in ${g.roomName}: ${g.label} and ${g.otherLabel}`} · {g.days.join(", ")} {g.time}
              {g.dates.length > 0 && ` · ${g.dates.length === 1 ? g.dates[0].toISOString().slice(0, 10) : `${g.dates.length} dates`}`}
            </span>
            {canEdit && (
              <button type="button" onClick={() => onResolve(g)} className="rounded border border-red-400 bg-white px-2 py-0.5 text-xs font-medium hover:bg-red-100">
                Resolve…
              </button>
            )}
          </li>
        ))}
        {capacityIssues.map((c) => (
          <li key={c.meetingId}>
            {c.label} expects {c.expectedEnrollment} students but {c.roomName} seats {c.capacity}
          </li>
        ))}
      </ul>
    </section>
  );
}
