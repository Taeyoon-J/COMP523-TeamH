"use client";

import { useEffect, useRef, useState } from "react";
import { roomAvailability, type BusySlot } from "@/lib/room-search";
import { formatTimeRange, WEEKDAYS, type Weekday } from "@/lib/scheduling";
import { followUps, sendJson } from "./schedule-actions";

export interface BookingRoom {
  id: string;
  name: string;
  capacity: number;
}

export interface BookingDraft {
  title: string;
  description: string;
  roomId: string;
  startDate: string;
  /** Empty for a one-time booking. */
  endDate: string;
  days: Weekday[];
  startMinute: number;
  endMinute: number;
}

/** Create (no editingId), edit (editingId), or replace both sides of a conflict (replace). */
export interface BookingDialogState {
  draft: BookingDraft;
  editingId?: string;
  replace?: { sides: [{ kind: string; ids: string[] }, { kind: string; ids: string[] }]; label: string };
  /** Bookings to leave out of the live check (the one being edited, or what's being replaced). */
  ignoreIds?: string[];
}

const SCHOOL_DAYS: Weekday[] = ["MON", "TUE", "WED", "THU", "FRI"];
const toHHMM = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const fromHHMM = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
const weekdayOf = (iso: string) => (["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"] as const)[new Date(`${iso}T00:00:00Z`).getUTCDay()];

/** Reserve a room (FR-4), with a live check against everything already in that room. */
export default function BookingDialog({
  state,
  rooms,
  busyByRoom,
  onClose,
  onDone,
}: {
  state: BookingDialogState | null;
  rooms: BookingRoom[];
  busyByRoom: Map<string, (BusySlot & { id: string })[]>;
  onClose: () => void;
  onDone: (messages: string[]) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState<BookingDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (state && !dialog.open) dialog.showModal();
    if (!state && dialog.open) dialog.close();
  }, [state]);

  // A new dialog starts from its draft.
  const [shownFor, setShownFor] = useState<BookingDialogState | null>(null);
  if (state !== shownFor) {
    setShownFor(state);
    setDraft(state?.draft ?? null);
    setError(null);
  }

  const repeats = Boolean(draft?.endDate && draft.endDate > draft.startDate);
  const room = rooms.find((r) => r.id === draft?.roomId);
  const check =
    draft && room && draft.startDate && draft.endMinute > draft.startMinute
      ? roomAvailability(
          (busyByRoom.get(room.name) ?? []).filter((b) => !state?.ignoreIds?.includes(b.id)),
          {
            roomText: "",
            category: null,
            minCapacity: null,
            days: repeats ? draft.days : [],
            date: repeats ? null : draft.startDate,
            startMinute: draft.startMinute,
            duration: draft.endMinute - draft.startMinute,
          },
          { from: draft.startDate, to: repeats ? draft.endDate : draft.startDate },
          { start: 0, end: 24 * 60 },
        )
      : null;

  const set = (patch: Partial<BookingDraft>) => setDraft((d) => (d ? { ...d, ...patch } : d));

  async function save() {
    if (!draft || !state) return;
    setSaving(true);
    setError(null);
    const booking = {
      roomId: draft.roomId,
      title: draft.title,
      description: draft.description || null,
      startDate: draft.startDate,
      endDate: repeats ? draft.endDate : null,
      days: repeats ? draft.days : undefined,
      startMinute: draft.startMinute,
      endMinute: draft.endMinute,
    };
    const result = state.replace
      ? await sendJson("/api/conflicts/resolve", { action: "replace", sides: state.replace.sides, booking })
      : state.editingId
        ? await sendJson(`/api/bookings/${state.editingId}`, booking, "PATCH")
        : await sendJson("/api/bookings", booking);
    setSaving(false);
    if (!result.ok) {
      const clashes = result.details?.conflicts?.map((c) => c.with) ?? [];
      setError(clashes.length ? `${result.error} Clashes with: ${[...new Set(clashes)].join(", ")}.` : (result.error ?? "Not saved."));
      return;
    }
    onDone([state.replace ? "Conflict resolved." : state.editingId ? "Booking updated." : "Room reserved.", ...followUps(result.data)]);
  }

  const heading = state?.replace ? "Replace with a new booking" : state?.editingId ? "Edit booking" : "Reserve a room";
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className="m-auto w-[min(34rem,calc(100vw-2rem))] rounded-lg p-0 shadow-xl backdrop:bg-black/40"
    >
      {draft && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
          className="space-y-4 p-5 text-sm text-zinc-800"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-zinc-900">{heading}</h2>
              {state?.replace && <p className="text-zinc-500">Clears {state.replace.label} and books this instead.</p>}
            </div>
            <button type="button" onClick={onClose} className="rounded px-2 py-1 text-zinc-500 hover:bg-zinc-100" aria-label="Close">
              ✕
            </button>
          </div>

          <label className="block space-y-1">
            <span className="text-xs text-zinc-500">Title</span>
            <input id="booking-title" required value={draft.title} onChange={(e) => set({ title: e.target.value })} className="w-full rounded border border-zinc-300 px-2 py-1.5" />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1">
              <span className="text-xs text-zinc-500">Room</span>
              <select id="booking-room" value={draft.roomId} onChange={(e) => set({ roomId: e.target.value })} className="w-full rounded border border-zinc-300 px-2 py-1.5">
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.capacity} seats)
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-xs text-zinc-500">{repeats ? "First date" : "Date"}</span>
              <input
                id="booking-date"
                type="date"
                required
                value={draft.startDate}
                onChange={(e) => set({ startDate: e.target.value, days: draft.days.length ? draft.days : [weekdayOf(e.target.value)] })}
                className="w-full rounded border border-zinc-300 px-2 py-1.5"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs text-zinc-500">Start</span>
              <input id="booking-start" type="time" step={300} required value={toHHMM(draft.startMinute)} onChange={(e) => e.target.value && set({ startMinute: fromHHMM(e.target.value) })} className="w-full rounded border border-zinc-300 px-2 py-1.5" />
            </label>
            <label className="block space-y-1">
              <span className="text-xs text-zinc-500">End</span>
              <input id="booking-end" type="time" step={300} required value={toHHMM(draft.endMinute)} onChange={(e) => e.target.value && set({ endMinute: fromHHMM(e.target.value) })} className="w-full rounded border border-zinc-300 px-2 py-1.5" />
            </label>
          </div>

          <fieldset className="space-y-2">
            <label className="flex items-center gap-2">
              <input
                id="booking-repeat"
                type="checkbox"
                checked={repeats}
                onChange={(e) =>
                  set(
                    e.target.checked
                      ? { endDate: addWeeks(draft.startDate, 4), days: draft.days.length ? draft.days : [weekdayOf(draft.startDate)] }
                      : { endDate: "" },
                  )
                }
              />
              <span>Repeat every week</span>
            </label>
            {repeats && (
              <div className="flex flex-wrap items-center gap-3 pl-6">
                {SCHOOL_DAYS.map((d) => (
                  <label key={d} className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={draft.days.includes(d)}
                      onChange={(e) => set({ days: WEEKDAYS.filter((x) => (x === d ? e.target.checked : draft.days.includes(x))) })}
                    />
                    {d[0] + d.slice(1).toLowerCase()}
                  </label>
                ))}
                <label className="flex items-center gap-2">
                  until
                  <input id="booking-until" type="date" value={draft.endDate} min={draft.startDate} onChange={(e) => set({ endDate: e.target.value })} className="rounded border border-zinc-300 px-2 py-1" />
                </label>
              </div>
            )}
          </fieldset>

          <label className="block space-y-1">
            <span className="text-xs text-zinc-500">Description (goes to the spreadsheet)</span>
            <textarea id="booking-description" rows={3} value={draft.description} onChange={(e) => set({ description: e.target.value })} className="w-full rounded border border-zinc-300 px-2 py-1.5" />
          </label>

          {check && (
            <p className={check.fits ? "text-emerald-700" : "text-red-700"}>
              {check.fits
                ? `${room?.name} is free ${formatTimeRange(draft.startMinute, draft.endMinute)}${check.dates > 1 ? ` on all ${check.dates} dates` : ""}.`
                : `${room?.name} is busy then: ${check.blockers.slice(0, 3).join(", ")}${check.blockers.length > 3 ? ", …" : ""}.`}
            </p>
          )}
          {error && <p className="rounded border border-red-200 bg-red-50 p-2 text-red-800">{error}</p>}

          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded border border-zinc-300 px-3 py-1.5 hover:bg-zinc-50">
              Cancel
            </button>
            <button type="submit" disabled={saving || (check !== null && !check.fits)} className="rounded bg-zinc-900 px-3 py-1.5 text-white disabled:opacity-40">
              {saving ? "Saving…" : state?.replace ? "Replace with this booking" : state?.editingId ? "Save changes" : "Reserve room"}
            </button>
          </div>
        </form>
      )}
    </dialog>
  );
}

function addWeeks(iso: string, weeks: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + weeks * 7);
  return d.toISOString().slice(0, 10);
}
