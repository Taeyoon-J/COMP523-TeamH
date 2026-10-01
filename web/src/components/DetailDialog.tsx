"use client";

import { useEffect, useRef } from "react";
import type { CalendarItem } from "./ScheduleCalendar";

/** Details for one course meeting or room booking, opened by clicking it on either view. */
export default function DetailDialog({ item, onClose }: { item: CalendarItem | null; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (item && !dialog.open) dialog.showModal();
    if (!item && dialog.open) dialog.close();
  }, [item]);

  const d = item?.details;
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      // Clicking the backdrop (outside the panel) closes the dialog.
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-lg p-0 shadow-xl backdrop:bg-black/40"
    >
      {d && (
        <div className="space-y-4 p-5 text-sm text-zinc-800">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <span
                className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${
                  item.kind === "course" ? "bg-sky-100 text-sky-800" : "bg-zinc-100 text-zinc-700"
                }`}
              >
                {d.kindLabel}
              </span>
              <h2 className="text-lg font-semibold leading-snug text-zinc-900">{d.title}</h2>
            </div>
            <button onClick={onClose} className="rounded px-2 py-1 text-zinc-500 hover:bg-zinc-100" aria-label="Close">
              ✕
            </button>
          </div>

          {d.problems.length > 0 && (
            <ul className="space-y-1 rounded border border-red-200 bg-red-50 p-3 text-red-900">
              {d.problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}

          <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-1.5">
            {d.rows.map((r) => (
              <div key={r.label} className="contents">
                <dt className="text-zinc-500">{r.label}</dt>
                <dd>{r.value}</dd>
              </div>
            ))}
          </dl>

          {d.description && (
            <p className="max-h-48 overflow-y-auto whitespace-pre-line rounded bg-zinc-50 p-3 text-zinc-700">{d.description}</p>
          )}

          {d.link && (
            <a href={d.link} target="_blank" rel="noreferrer" className="inline-block text-sky-700 underline underline-offset-2">
              Open in Google Calendar
            </a>
          )}
        </div>
      )}
    </dialog>
  );
}
