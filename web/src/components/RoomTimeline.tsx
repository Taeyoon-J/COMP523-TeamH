"use client";

import { useState, useSyncExternalStore } from "react";
import { buildingName, OPEN_HOURS } from "@/lib/room-search";
import { formatTimeRange, WEEKDAYS, type Weekday } from "@/lib/scheduling";
import DetailDialog from "./DetailDialog";
import { noopSubscribe, type CalendarItem } from "./ScheduleCalendar";

export interface TimelineRoom {
  name: string;
  capacity: number;
  category: string | null;
}

const SPAN = OPEN_HOURS.end - OPEN_HOURS.start;
const HOURS = Array.from({ length: SPAN / 60 + 1 }, (_, i) => OPEN_HOURS.start + i * 60);
const LANE_HEIGHT = 26;
const WEEKDAY_OF = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"] as const;
const SCHOOL_DAYS: Weekday[] = ["MON", "TUE", "WED", "THU", "FRI"];

/**
 * One day, every room: rooms down the side, time across the top (like 25Live's daily availability
 * grid). Click a booking for details, or a room name for that room's week.
 */
export default function RoomTimeline({
  rooms,
  items,
  onSelectRoom,
  days,
  date: fixedDate,
  highlight,
}: {
  rooms: TimelineRoom[];
  items: CalendarItem[];
  onSelectRoom: (room: string) => void;
  /** Only step through these weekdays (e.g. a search for Wednesdays). */
  days?: Weekday[];
  /** Show this date and hide the day controls. */
  date?: string | null;
  /** A requested time to shade, e.g. from a search. */
  highlight?: { start: number; end: number } | null;
}) {
  // Render in the browser only: "today" depends on the viewer's clock and time zone.
  const isClient = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const [viewDate, setViewDate] = useState(() => (isClient ? localToday() : ""));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  if (!isClient) return <div className="min-h-[600px]" />;

  const allowed = days?.length ? days : SCHOOL_DAYS;
  const today = localToday();
  const date = fixedDate ?? nextAllowed(viewDate || today, allowed, 0);
  const step = (dir: 1 | -1) => setViewDate(nextAllowed(addDays(date, dir), allowed, dir));
  const weekday = weekdayOf(date);

  const onDay = items.filter((i) => i.roomName && i.startRecur <= date && date < i.endRecur && i.days.includes(weekday));
  const byRoom = new Map<string, CalendarItem[]>();
  for (const i of onDay) byRoom.set(i.roomName!, [...(byRoom.get(i.roomName!) ?? []), i]);

  const groups = [
    { label: "Classrooms", rooms: rooms.filter((r) => r.category === "Classroom") },
    { label: "Conference rooms", rooms: rooms.filter((r) => r.category === "Conference Room") },
    { label: "Other rooms", rooms: rooms.filter((r) => r.category !== "Classroom" && r.category !== "Conference Room") },
  ].filter((g) => g.rooms.length);

  const nowMinute = date === today ? minutesNow() : null;
  const pct = (minute: number) => `${((Math.min(Math.max(minute, OPEN_HOURS.start), OPEN_HOURS.end) - OPEN_HOURS.start) / SPAN) * 100}%`;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-xl font-semibold">{longDate(date)}</h3>
        {!fixedDate && (
          <div className="flex items-center gap-2 text-sm">
            <button
              type="button"
              onClick={() => setViewDate(nextAllowed(today, allowed, 0))}
              className="rounded border border-zinc-300 px-3 py-1 hover:bg-zinc-50"
            >
              Today
            </button>
            <button type="button" onClick={() => step(-1)} aria-label="Previous day" className="rounded border border-zinc-300 px-3 py-1 hover:bg-zinc-50">
              ‹
            </button>
            <button type="button" onClick={() => step(1)} aria-label="Next day" className="rounded border border-zinc-300 px-3 py-1 hover:bg-zinc-50">
              ›
            </button>
          </div>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
        <div className="min-w-[760px]">
          {/* Hour scale */}
          <div className="grid grid-cols-[9.5rem_1fr] border-b border-zinc-200 text-xs text-zinc-500">
            <div className="px-3 py-2">Room</div>
            <div className="relative h-8">
              {HOURS.map((h) => (
                <span
                  key={h}
                  className={`absolute top-2 tabular-nums ${h === OPEN_HOURS.end ? "-translate-x-full pr-1" : h === OPEN_HOURS.start ? "pl-1" : "-translate-x-1/2"}`}
                  style={{ left: pct(h) }}
                >
                  {hourLabel(h)}
                </span>
              ))}
            </div>
          </div>

          {groups.map((group) => (
            <div key={group.label}>
              <div className="border-b border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-medium uppercase tracking-wide text-zinc-500">
                {group.label}
              </div>
              {group.rooms.map((room) => {
                const lanes = assignLanes(byRoom.get(room.name) ?? []);
                const laneCount = Math.max(1, ...lanes.map((l) => l.lane + 1));
                return (
                  <div key={room.name} className="grid grid-cols-[9.5rem_1fr] border-b border-zinc-100 last:border-b-0">
                    <button
                      type="button"
                      onClick={() => onSelectRoom(room.name)}
                      className="flex items-baseline justify-between gap-2 px-3 py-2 text-left hover:bg-sky-50"
                      title={`Show ${room.name}'s week`}
                    >
                      <span className="font-medium text-zinc-900 underline-offset-2 hover:underline">{room.name}</span>
                      <span className="text-xs tabular-nums text-zinc-500">{room.capacity} seats</span>
                    </button>
                    <div className="relative" style={{ height: laneCount * LANE_HEIGHT + 10 }}>
                      {HOURS.map((h) => (
                        <div key={h} className="absolute inset-y-0 border-l border-zinc-100" style={{ left: pct(h) }} />
                      ))}
                      {highlight && (
                        <div
                          className="absolute inset-y-0 border-x border-sky-300 bg-sky-100/60"
                          style={{ left: pct(highlight.start), width: `calc(${pct(highlight.end)} - ${pct(highlight.start)})` }}
                        />
                      )}
                      {nowMinute !== null && nowMinute >= OPEN_HOURS.start && nowMinute <= OPEN_HOURS.end && (
                        <div className="absolute inset-y-0 w-px bg-red-500" style={{ left: pct(nowMinute) }} />
                      )}
                      {lanes.map(({ item, lane }) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setSelectedId(item.id)}
                          title={`${item.label} · ${formatTimeRange(item.startMinute, item.endMinute)}`}
                          className={`absolute overflow-hidden whitespace-nowrap rounded px-1.5 text-left text-xs leading-[22px] text-white shadow-sm hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${
                            item.hasProblem ? "bg-red-600" : item.kind === "reservation" ? "bg-zinc-500" : "bg-[#4b9cd3]"
                          }`}
                          style={{
                            left: pct(item.startMinute),
                            width: `max(4px, calc(${pct(item.endMinute)} - ${pct(item.startMinute)} - 2px))`,
                            top: 5 + lane * LANE_HEIGHT,
                            height: LANE_HEIGHT - 4,
                          }}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
          {rooms.length === 0 && <p className="px-3 py-6 text-sm text-zinc-500">No rooms match the search.</p>}
        </div>
      </div>
      <p className="text-xs text-zinc-500">
        {buildingNote(rooms)} Blue: courses · Gray: calendar bookings · Red: conflicts or too small. Click a room for its week.
      </p>

      <DetailDialog item={items.find((i) => i.id === selectedId) ?? null} onClose={() => setSelectedId(null)} />
    </div>
  );
}

/** Puts overlapping bookings in the same room on separate lanes so none hide each other. */
function assignLanes(items: CalendarItem[]): { item: CalendarItem; lane: number }[] {
  const laneEnds: number[] = [];
  return [...items]
    .sort((a, b) => a.startMinute - b.startMinute || b.endMinute - a.endMinute)
    .map((item) => {
      let lane = laneEnds.findIndex((end) => end <= item.startMinute);
      if (lane === -1) lane = laneEnds.length;
      laneEnds[lane] = item.endMinute;
      return { item, lane };
    });
}

function buildingNote(rooms: TimelineRoom[]): string {
  const buildings = [...new Set(rooms.map((r) => buildingName(r.name)).filter(Boolean))];
  return buildings.length ? `${buildings.join(" & ")}.` : "";
}

function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function minutesNow(): number {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function weekdayOf(iso: string): Weekday {
  return WEEKDAY_OF[new Date(`${iso}T00:00:00Z`).getUTCDay()];
}

/** `iso` itself if it's an allowed weekday, else the nearest allowed day in direction `dir` (0 = forward). */
function nextAllowed(iso: string, allowed: Weekday[], dir: -1 | 0 | 1): string {
  const valid = allowed.filter((d) => WEEKDAYS.includes(d));
  let d = iso;
  for (let i = 0; i < 7 && !valid.includes(weekdayOf(d)); i++) d = addDays(d, dir === -1 ? -1 : 1);
  return d;
}

function longDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

function hourLabel(minute: number): string {
  const h = minute / 60;
  return h === 12 ? "12pm" : h > 12 ? `${h - 12}pm` : `${h}am`;
}
