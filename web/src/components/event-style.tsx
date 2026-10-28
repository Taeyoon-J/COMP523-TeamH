"use client";

import type { CalendarItem } from "./ScheduleCalendar";

/** One color per data source, so you can tell where a booking came from at a glance (NFR-4). */
export const SOURCES: Record<CalendarItem["edit"]["source"], { label: string; color: string }> = {
  TWENTYFIVE_LIVE: { label: "25Live course", color: "#4b9cd3" },
  GOOGLE_CALENDAR: { label: "Google Calendar booking", color: "#6b7280" },
  LOCAL: { label: "Made or edited in this app", color: "#7c3aed" },
};

export const PROBLEM_BADGE = {
  conflict: { label: "Room conflict", className: "bg-red-600" },
  capacity: { label: "Room too small", className: "bg-amber-500" },
} as const;

export function sourceColor(item: CalendarItem): string {
  return SOURCES[item.edit.source].color;
}

/** Small "!" in the corner of a booking that has a problem; the booking keeps its source color. */
export function ProblemBadge({ problem }: { problem: CalendarItem["problem"] }) {
  if (!problem) return null;
  const badge = PROBLEM_BADGE[problem];
  return (
    <span
      title={badge.label}
      aria-label={badge.label}
      className={`absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold leading-none text-white ring-1 ring-white ${badge.className}`}
    >
      !
    </span>
  );
}

export function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-600">
      {Object.values(SOURCES).map((s) => (
        <span key={s.label} className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm" style={{ background: s.color }} />
          {s.label}
        </span>
      ))}
      {Object.values(PROBLEM_BADGE).map((b) => (
        <span key={b.label} className="flex items-center gap-1.5">
          <span className={`flex h-3.5 w-3.5 items-center justify-center rounded-full text-[9px] font-bold text-white ${b.className}`}>!</span>
          {b.label}
        </span>
      ))}
    </div>
  );
}
