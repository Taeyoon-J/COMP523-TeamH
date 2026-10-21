"use client";

import { useEffect, useRef, useState } from "react";
import type { CalendarItem } from "./ScheduleCalendar";
import { useScheduleActions } from "./schedule-actions";

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
          <Actions item={item} onClose={onClose} />
        </div>
      )}
    </dialog>
  );
}

/** Edit / cancel / resolve, for admins. Cancelling asks first, inside the dialog. */
function Actions({ item, onClose }: { item: CalendarItem; onClose: () => void }) {
  const actions = useScheduleActions();
  const [confirming, setConfirming] = useState<null | "one" | "series">(null);
  const [busy, setBusy] = useState(false);
  const [shownFor, setShownFor] = useState(item);
  if (item !== shownFor) {
    setShownFor(item);
    setConfirming(null);
  }
  if (!actions?.canEdit) return null;

  const isBooking = item.kind === "reservation";
  const local = item.edit.source === "LOCAL";
  const series = isBooking ? actions.seriesIds(item) : [];
  const cancel = async (ids: string[], what: string) => {
    setBusy(true);
    const ok = await actions.cancelBookings(ids, what);
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <div className="space-y-2 border-t border-zinc-200 pt-3">
      <div className="flex flex-wrap gap-2">
        {item.hasProblem && item.details.problems.some((p) => p.startsWith("Overlaps") || p.startsWith("Booked twice")) && (
          <button
            type="button"
            onClick={() => {
              if (actions.resolveFor(item)) onClose();
            }}
            className="rounded bg-red-700 px-3 py-1.5 text-white hover:bg-red-800"
          >
            Resolve conflict…
          </button>
        )}
        {isBooking && local && (
          <button
            type="button"
            onClick={() => {
              actions.editBooking(item);
              onClose();
            }}
            className="rounded border border-zinc-300 px-3 py-1.5 hover:bg-zinc-50"
          >
            Edit booking
          </button>
        )}
        {isBooking && !confirming && (
          <button type="button" onClick={() => setConfirming(series.length > 1 && !local ? "series" : "one")} className="rounded border border-zinc-300 px-3 py-1.5 text-red-700 hover:bg-red-50">
            Cancel booking…
          </button>
        )}
      </div>
      {confirming && (
        <div className="space-y-2 rounded border border-red-200 bg-red-50 p-3 text-red-900">
          <p>
            {local
              ? "Cancel this booking? It's removed from the schedule and marked cancelled in the spreadsheet."
              : "Cancel this booking in this app? It's marked cancelled here and in the spreadsheet. The Google Calendar event belongs to someone else and stays as it is."}
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => void cancel([item.id], "this date")} className="rounded bg-red-700 px-3 py-1 text-white disabled:opacity-40">
              {local || series.length <= 1 ? "Yes, cancel it" : "Cancel this date only"}
            </button>
            {!local && series.length > 1 && (
              <button type="button" disabled={busy} onClick={() => void cancel(series, `all ${series.length} dates`)} className="rounded bg-red-700 px-3 py-1 text-white disabled:opacity-40">
                Cancel all {series.length} dates
              </button>
            )}
            <button type="button" onClick={() => setConfirming(null)} className="rounded border border-red-300 px-3 py-1">
              Keep it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
