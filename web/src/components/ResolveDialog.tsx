"use client";

import { useEffect, useRef, useState } from "react";
import type { ConflictGroup, ConflictSideInfo } from "@/lib/schedule-data";
import { roomAvailability, type BusySlot } from "@/lib/room-search";
import { formatDays, formatTimeRange } from "@/lib/scheduling";
import type { BookingDialogState, BookingRoom } from "./BookingDialog";
import { followUps, sendJson } from "./schedule-actions";

/**
 * Resolve a room conflict (FR-5): keep one side and move or cancel the other, or clear both and book
 * something new in that slot.
 */
export default function ResolveDialog({
  group,
  rooms,
  busyByRoom,
  range,
  enrollmentOf,
  onClose,
  onDone,
  onReplace,
}: {
  group: ConflictGroup | null;
  rooms: (BookingRoom & { category: string | null })[];
  busyByRoom: Map<string, (BusySlot & { id: string })[]>;
  range: { from: string; to: string };
  enrollmentOf: (meetingId: string) => number;
  onClose: () => void;
  onDone: (messages: string[]) => void;
  onReplace: (state: BookingDialogState) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [keepIndex, setKeepIndex] = useState<0 | 1 | null>(null);
  const [moveTo, setMoveTo] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [shownFor, setShownFor] = useState<ConflictGroup | null>(null);
  if (group !== shownFor) {
    setShownFor(group);
    setKeepIndex(null);
    setMoveTo("");
    setError(null);
  }

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (group && !dialog.open) dialog.showModal();
    if (!group && dialog.open) dialog.close();
  }, [group]);

  if (!group) return <dialog ref={ref} className="hidden" />;

  const other = keepIndex === null ? null : group.sides[keepIndex === 0 ? 1 : 0];
  const when = group.dates.length
    ? group.dates.length === 1
      ? group.dates[0].toISOString().slice(0, 10)
      : `${group.dates.length} dates from ${group.dates[0].toISOString().slice(0, 10)}`
    : "every week";

  // Rooms a course could move to: big enough and free at its time every week.
  const moveOptions =
    other?.kind === "course"
      ? rooms
          .filter((r) => r.name !== group.roomName && r.capacity >= enrollmentOf(other.ids[0]))
          .filter(
            (r) =>
              roomAvailability(
                (busyByRoom.get(r.name) ?? []).filter((b) => !other.ids.includes(b.id)),
                { roomText: "", category: null, minCapacity: null, days: other.days, date: null, startMinute: other.startMinute, duration: other.endMinute - other.startMinute },
                range,
                { start: 0, end: 24 * 60 },
              )?.fits,
          )
          .sort((a, b) => Number(b.category === "Classroom") - Number(a.category === "Classroom") || a.capacity - b.capacity)
      : [];

  async function confirmKeep() {
    if (keepIndex === null || !other || !group) return;
    setSaving(true);
    setError(null);
    const result = await sendJson("/api/conflicts/resolve", {
      action: "keep",
      keep: { kind: group.sides[keepIndex].kind, ids: group.sides[keepIndex].ids },
      other: { kind: other.kind, ids: other.ids },
      moveToRoomId: other.kind === "course" ? moveTo || null : undefined,
    });
    setSaving(false);
    if (!result.ok) return setError(result.error ?? "Not resolved.");
    onDone(["Conflict resolved.", ...followUps(result.data)]);
  }

  function replace() {
    if (!group) return;
    const [a, b] = group.sides;
    const firstDate = group.dates[0]?.toISOString().slice(0, 10) ?? range.from;
    const lastDate = group.dates.length ? group.dates[group.dates.length - 1].toISOString().slice(0, 10) : range.to;
    onReplace({
      draft: {
        title: "",
        description: "",
        roomId: group.roomId,
        startDate: firstDate,
        endDate: lastDate > firstDate ? lastDate : "",
        days: group.days,
        startMinute: Math.min(a.startMinute, b.startMinute),
        endMinute: Math.max(a.endMinute, b.endMinute),
      },
      replace: { sides: [{ kind: a.kind, ids: a.ids }, { kind: b.kind, ids: b.ids }], label: `${a.label} and ${b.label}` },
      ignoreIds: [...a.ids, ...b.ids],
    });
  }

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className="m-auto w-[min(44rem,calc(100vw-2rem))] rounded-lg p-0 shadow-xl backdrop:bg-black/40"
    >
      <div className="space-y-4 p-5 text-sm text-zinc-800">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">{group.duplicate ? `Booked twice in ${group.roomName}` : `Conflict in ${group.roomName}`}</h2>
            <p className="text-zinc-500">
              {formatDays(group.days)} {group.time} · {when}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded px-2 py-1 text-zinc-500 hover:bg-zinc-100" aria-label="Close">
            ✕
          </button>
        </div>

        <p className="text-zinc-600">Pick the one to keep in {group.roomName}:</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {group.sides.map((side, i) => (
            <SideCard
              key={i}
              side={side}
              enrollment={side.kind === "course" ? enrollmentOf(side.ids[0]) : null}
              selected={keepIndex === i}
              onKeep={() => {
                setKeepIndex(i as 0 | 1);
                setMoveTo("");
              }}
            />
          ))}
        </div>

        {other && (
          <div className="space-y-2 rounded border border-zinc-200 bg-zinc-50 p-3">
            {other.kind === "course" ? (
              <>
                <label htmlFor="move-to" className="block font-medium">
                  Move {other.label} to
                </label>
                <select id="move-to" value={moveTo} onChange={(e) => setMoveTo(e.target.value)} className="w-full rounded border border-zinc-300 px-2 py-1.5">
                  <option value="">No room for now (needs a room later)</option>
                  {moveOptions.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} · {r.capacity} seats · free {formatDays(other.days)} {formatTimeRange(other.startMinute, other.endMinute)}
                    </option>
                  ))}
                </select>
                {moveOptions.length === 0 && <p className="text-amber-700">No other room is free at this time every week with enough seats.</p>}
              </>
            ) : (
              <p>
                Cancel <strong>{other.label}</strong> on the {other.ids.length === 1 ? "clashing date" : `${other.ids.length} clashing dates`}.
                {" "}
                <span className="text-zinc-500">
                  If it came from Google Calendar, it is cancelled in this app and the spreadsheet; the event in Google Calendar is left for its owner.
                </span>
              </p>
            )}
            <div className="flex justify-end">
              <button type="button" disabled={saving} onClick={() => void confirmKeep()} className="rounded bg-zinc-900 px-3 py-1.5 text-white disabled:opacity-40">
                {saving ? "Saving…" : `Keep ${group.sides[keepIndex!].label}`}
              </button>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-200 pt-3">
          <p className="text-zinc-600">Or clear both and put something new in this slot.</p>
          <button type="button" onClick={replace} className="rounded border border-zinc-300 px-3 py-1.5 hover:bg-zinc-50">
            Replace both with a new booking…
          </button>
        </div>
        {error && <p className="rounded border border-red-200 bg-red-50 p-2 text-red-800">{error}</p>}
      </div>
    </dialog>
  );
}

function SideCard({ side, enrollment, selected, onKeep }: { side: ConflictSideInfo; enrollment: number | null; selected: boolean; onKeep: () => void }) {
  return (
    <div className={`space-y-2 rounded border p-3 ${selected ? "border-emerald-500 bg-emerald-50" : "border-zinc-200"}`}>
      <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${side.kind === "course" ? "bg-sky-100 text-sky-800" : "bg-zinc-100 text-zinc-700"}`}>
        {side.kind === "course" ? "Course" : "Room booking"}
      </span>
      <p className="font-medium text-zinc-900">{side.label}</p>
      <p className="text-zinc-500">
        {formatDays(side.days)} {formatTimeRange(side.startMinute, side.endMinute)}
        {enrollment !== null && ` · ${enrollment} students`}
        {side.kind === "reservation" && side.ids.length > 1 && ` · ${side.ids.length} dates`}
      </p>
      <button type="button" onClick={onKeep} aria-pressed={selected} className={`rounded px-3 py-1 ${selected ? "bg-emerald-700 text-white" : "border border-zinc-300 hover:bg-zinc-50"}`}>
        {selected ? "Keeping this" : "Keep this one"}
      </button>
    </div>
  );
}
