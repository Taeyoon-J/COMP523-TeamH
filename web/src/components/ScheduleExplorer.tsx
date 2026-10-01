"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  buildingName,
  DEFAULT_DURATION,
  describeQuery,
  describeWindows,
  hasTimeQuery,
  matchesRoom,
  parseSearch,
  roomAvailability,
  type BusySlot,
  type RoomAvailability,
  type RoomCategory,
  type SearchQuery,
} from "@/lib/room-search";
import { formatTimeRange, type Weekday } from "@/lib/scheduling";
import RoomTimeline from "./RoomTimeline";
import ScheduleCalendar, { type CalendarItem } from "./ScheduleCalendar";

export interface ExplorerRoom {
  name: string;
  capacity: number;
  category: string | null;
}

const DAY_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Any day" },
  { value: "MON", label: "Monday" },
  { value: "TUE", label: "Tuesday" },
  { value: "WED", label: "Wednesday" },
  { value: "THU", label: "Thursday" },
  { value: "FRI", label: "Friday" },
  { value: "MON,WED,FRI", label: "Mon/Wed/Fri" },
  { value: "TUE,THU", label: "Tue/Thu" },
  { value: "MON,WED", label: "Mon/Wed" },
];

const EXAMPLES = [
  "SN014",
  "FB",
  "009",
  "Wednesday 1:15 min class with capacity at least 50",
  "TR at 2pm 40+ seats",
];

/** Search rooms by name or by the class you need to place (FR-2, FR-12), then see one room's schedule. */
export default function ScheduleExplorer({
  rooms,
  items,
  range,
}: {
  rooms: ExplorerRoom[];
  items: CalendarItem[];
  /** Dates checked for "every week" searches (inclusive, YYYY-MM-DD). */
  range: { from: string; to: string };
}) {
  const [text, setText] = useState("");
  // Edits made in the controls, on top of what the text says. Typing in the box starts over.
  const [overrides, setOverrides] = useState<Partial<SearchQuery>>({});
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);
  const [view, setView] = useState<"rooms" | "calendar">("rooms");
  // The filters and results open over the calendar while searching, so the calendar never moves.
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node))
        setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const query: SearchQuery = { ...parseSearch(text), ...overrides };
  const timeQuery = hasTimeQuery(query);
  const set = (patch: Partial<SearchQuery>) =>
    setOverrides((o) => ({ ...o, ...patch }));

  const busyByRoom = useMemo(() => {
    const map = new Map<string, BusySlot[]>();
    for (const i of items) {
      if (!i.roomName) continue;
      const slot: BusySlot = {
        label: i.label,
        days: i.days,
        startMinute: i.startMinute,
        endMinute: i.endMinute,
        startDate: i.startRecur,
        endDate: dayBefore(i.endRecur),
      };
      map.set(i.roomName, [...(map.get(i.roomName) ?? []), slot]);
    }
    return map;
  }, [items]);

  const results = rooms
    .filter((r) => matchesRoom(r, query))
    .map((room) => ({
      room,
      availability: roomAvailability(
        busyByRoom.get(room.name) ?? [],
        query,
        range,
      ),
    }))
    .sort(
      (a, b) =>
        Number(b.availability?.fits ?? true) -
          Number(a.availability?.fits ?? true) ||
        (timeQuery
          ? a.room.capacity - b.room.capacity
          : a.room.name.localeCompare(b.room.name)),
    );

  const filtering = text.trim() !== "" || Object.keys(overrides).length > 0;
  const visibleRooms = selectedRoom
    ? new Set([selectedRoom])
    : filtering
      ? new Set(
          results
            .filter((r) => r.availability?.fits ?? true)
            .map((r) => r.room.name),
        )
      : null;
  const calendarItems = visibleRooms
    ? items.filter((i) => i.roomName && visibleRooms.has(i.roomName))
    : items;
  const timelineRooms = filtering
    ? rooms.filter((r) => visibleRooms?.has(r.name))
    : rooms;
  const fitting = results.filter((r) => r.availability?.fits).length;
  const dayValue = query.days.join(",");

  const clear = () => {
    setText("");
    setOverrides({});
    setSelectedRoom(null);
  };
  const summary = `${describeQuery(query, query.date ? undefined : range.to)}${timeQuery ? ` · ${fitting} of ${results.length} free` : ` · ${results.length} rooms`}`;

  return (
    <div className="space-y-4">
      <div ref={boxRef} className="relative">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <label htmlFor="room-search" className="sr-only">
            Find a room
          </label>
          <input
            id="room-search"
            type="search"
            value={text}
            onFocus={() => setOpen(true)}
            onChange={(e) => {
              setText(e.target.value);
              setOverrides({});
              setSelectedRoom(null);
              setOpen(true);
            }}
            placeholder="Find a room: SN014, FB, 009, or “Wednesday 1:15 min class with capacity at least 50”"
            className="min-w-0 flex-1 basis-80 rounded border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
            aria-controls="room-search-panel"
          />
          {filtering && !open && (
            <p className="flex items-center gap-2 text-sm text-zinc-600">
              <span>{summary}</span>
              <button
                type="button"
                onClick={clear}
                className="text-sky-700 underline underline-offset-2"
              >
                Clear
              </button>
            </p>
          )}
        </div>

        {open && (
          <section
            id="room-search-panel"
            className="absolute inset-x-0 top-full z-30 mt-2 max-h-[70vh] space-y-3 overflow-y-auto rounded-lg border border-zinc-200 bg-white p-4 shadow-xl"
          >
            <div className="flex flex-wrap gap-2 text-xs text-zinc-500">
              <span>Try:</span>
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => {
                    setText(ex);
                    setOverrides({});
                    setSelectedRoom(null);
                  }}
                  className="rounded-full border border-zinc-200 px-2 py-0.5 hover:border-sky-400 hover:text-sky-700"
                >
                  {ex}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3 lg:grid-cols-6">
              <Field label="Seats at least" htmlFor="min-seats">
                <input
                  id="min-seats"
                  type="number"
                  min={0}
                  value={query.minCapacity ?? ""}
                  onChange={(e) =>
                    set({
                      minCapacity:
                        e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                  className="w-full rounded border border-zinc-300 px-2 py-1"
                />
              </Field>
              <Field label="Room type" htmlFor="room-type">
                <select
                  id="room-type"
                  value={query.category ?? ""}
                  onChange={(e) =>
                    set({
                      category: (e.target.value || null) as RoomCategory | null,
                    })
                  }
                  className="w-full rounded border border-zinc-300 px-2 py-1"
                >
                  <option value="">Any</option>
                  <option value="Classroom">Classroom</option>
                  <option value="Conference Room">Conference room</option>
                </select>
              </Field>
              <Field label="Day" htmlFor="day">
                <select
                  id="day"
                  value={dayValue}
                  onChange={(e) =>
                    set({
                      days: e.target.value
                        ? (e.target.value.split(",") as Weekday[])
                        : [],
                      date: null,
                    })
                  }
                  className="w-full rounded border border-zinc-300 px-2 py-1"
                >
                  {!DAY_OPTIONS.some((o) => o.value === dayValue) && (
                    <option value={dayValue}>{query.days.join("/")}</option>
                  )}
                  {DAY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Or one date" htmlFor="date">
                <input
                  id="date"
                  type="date"
                  value={query.date ?? ""}
                  onChange={(e) => set({ date: e.target.value || null })}
                  className="w-full rounded border border-zinc-300 px-2 py-1"
                />
              </Field>
              <Field label="Start time" htmlFor="start">
                <input
                  id="start"
                  type="time"
                  step={300}
                  value={
                    query.startMinute === null ? "" : toHHMM(query.startMinute)
                  }
                  onChange={(e) =>
                    set({
                      startMinute: e.target.value
                        ? fromHHMM(e.target.value)
                        : null,
                    })
                  }
                  className="w-full rounded border border-zinc-300 px-2 py-1"
                />
              </Field>
              <Field label="Length (minutes)" htmlFor="length">
                <input
                  id="length"
                  type="number"
                  min={5}
                  step={5}
                  value={query.duration ?? ""}
                  onChange={(e) =>
                    set({
                      duration:
                        e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                  className="w-full rounded border border-zinc-300 px-2 py-1"
                />
              </Field>
            </div>

            <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
              <p className="text-zinc-600">{summary}</p>
              <div className="flex gap-3">
                {filtering && (
                  <button
                    type="button"
                    onClick={clear}
                    className="text-sky-700 underline underline-offset-2"
                  >
                    Clear search
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="text-zinc-600 underline underline-offset-2"
                >
                  Done
                </button>
              </div>
            </div>
            {!timeQuery &&
              (query.startMinute !== null || query.duration !== null) && (
                <p className="text-sm text-amber-700">
                  Add a day or a date to check when rooms are free.
                </p>
              )}

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b text-zinc-500">
                  <tr>
                    <th>Room</th>
                    <th>Building</th>
                    <th>Type</th>
                    <th>Seats</th>
                    <th>{timeQuery ? "Availability" : ""}</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map(({ room, availability }) => {
                    const selected = selectedRoom === room.name;
                    return (
                      <tr
                        key={room.name}
                        onClick={() => {
                          setSelectedRoom(selected ? null : room.name);
                          setOpen(false);
                        }}
                        className={`cursor-pointer border-b hover:bg-sky-50 ${selected ? "bg-sky-100" : ""} ${
                          availability && !availability.fits
                            ? "text-zinc-400"
                            : ""
                        }`}
                      >
                        <td className="font-medium">
                          <button
                            type="button"
                            className="text-left underline-offset-2 hover:underline"
                            aria-pressed={selected}
                          >
                            {room.name}
                          </button>
                        </td>
                        <td>{buildingName(room.name) ?? "—"}</td>
                        <td>{room.category ?? "—"}</td>
                        <td className="tabular-nums">{room.capacity}</td>
                        <td>
                          {availability && (
                            <AvailabilityText a={availability} query={query} />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {results.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-3 text-zinc-500">
                        No rooms match. Try fewer seats or a shorter name.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>

      {selectedRoom ? (
        <section className="space-y-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold">
              {selectedRoom} · week view
              <span className="ml-2 text-sm font-normal text-zinc-500">
                {rooms.find((r) => r.name === selectedRoom)?.capacity} seats
              </span>
            </h2>
            <button
              type="button"
              onClick={() => setSelectedRoom(null)}
              className="text-sm text-sky-700 underline underline-offset-2"
            >
              {filtering ? "Back to matching rooms" : "Back to all rooms"}
            </button>
          </div>
          <ScheduleCalendar
            key={`${selectedRoom}-${query.date ?? "week"}`}
            items={calendarItems}
            initialDate={query.date ?? undefined}
          />
        </section>
      ) : (
        <section className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">
              {filtering
                ? `${timelineRooms.length} matching rooms`
                : "All rooms"}
            </h2>
            <div
              role="group"
              aria-label="View"
              className="inline-flex overflow-hidden rounded border border-zinc-300 text-sm"
            >
              {(
                [
                  ["rooms", "Rooms by time"],
                  ["calendar", "Week calendar"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={view === value}
                  onClick={() => setView(value)}
                  className={`px-3 py-1 ${view === value ? "bg-zinc-800 text-white" : "bg-white text-zinc-700 hover:bg-zinc-50"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          {view === "calendar" ? (
            <ScheduleCalendar
              key={`all-${query.date ?? "week"}`}
              items={calendarItems}
              initialDate={query.date ?? undefined}
            />
          ) : (
            <RoomTimeline
              rooms={timelineRooms}
              items={items}
              onSelectRoom={setSelectedRoom}
              days={query.days}
              date={query.date}
              highlight={
                query.startMinute !== null
                  ? {
                      start: query.startMinute,
                      end:
                        query.startMinute +
                        (query.duration ?? DEFAULT_DURATION),
                    }
                  : null
              }
            />
          )}
        </section>
      )}
    </div>
  );
}

function AvailabilityText({
  a,
  query,
}: {
  a: RoomAvailability;
  query: SearchQuery;
}) {
  const every = a.dates > 1 ? ` (all ${a.dates} dates)` : "";
  if (query.startMinute !== null) {
    const time = formatTimeRange(
      query.startMinute,
      query.startMinute + (query.duration ?? DEFAULT_DURATION),
    );
    return a.fits ? (
      <span className="text-emerald-700">
        Free {time}
        {every}
      </span>
    ) : (
      <span className="text-red-700">
        {a.blockers.length
          ? `Busy: ${a.blockers.slice(0, 3).join(", ")}${a.blockers.length > 3 ? ", …" : ""}`
          : "Outside 8 AM–9 PM"}
      </span>
    );
  }
  if (!a.fits)
    return (
      <span className="text-red-700">
        No free {query.duration ?? 30}-minute window
      </span>
    );
  const shown = a.freeWindows.slice(0, 4);
  return (
    <span className="text-emerald-700">
      Free {describeWindows(shown)}
      {a.freeWindows.length > shown.length ? ", …" : ""}
      {every}
    </span>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={htmlFor} className="block text-xs text-zinc-500">
        {label}
      </label>
      {children}
    </div>
  );
}

function dayBefore(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

const toHHMM = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const fromHHMM = (s: string) =>
  Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
