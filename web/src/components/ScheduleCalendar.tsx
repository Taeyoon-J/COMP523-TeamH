"use client";

import "temporal-polyfill/global";
import FullCalendar from "@fullcalendar/react";
import classicThemePlugin from "@fullcalendar/react/themes/classic";
import timeGridPlugin from "@fullcalendar/react/timegrid";
import "@fullcalendar/react/skeleton.css";
import "@fullcalendar/react/themes/classic/theme.css";
import "@fullcalendar/react/themes/classic/palette.css";
import { useState, useSyncExternalStore } from "react";
import DetailDialog from "./DetailDialog";

const DAY_INDEX = { SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6 } as const;

export interface CalendarItem {
  id: string;
  label: string;
  roomName: string | null;
  days: (keyof typeof DAY_INDEX)[];
  startMinute: number;
  endMinute: number;
  /** ISO dates; endRecur is exclusive. */
  startRecur: string;
  endRecur: string;
  kind: "course" | "reservation";
  hasProblem: boolean;
  details: ItemDetails;
}

/** What the detail dialog shows; prepared on the server. */
export interface ItemDetails {
  title: string;
  kindLabel: string;
  rows: { label: string; value: string }[];
  problems: string[];
  description: string | null;
  link: string | null;
}

const hhmm = (minute: number) => `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;

/**
 * Weekly view of courses and room bookings (FR-3, I-2). Courses are blue, calendar bookings gray,
 * anything with a problem red (I-7). Click an event for its details.
 */
export default function ScheduleCalendar({ items, initialDate }: { items: CalendarItem[]; initialDate?: string }) {
  // Render in the browser only: server and browser Intl output differ slightly (e.g. spaces in "9:05 – 9:55"),
  // which breaks hydration.
  const isClient = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = items.find((i) => i.id === selectedId) ?? null;

  if (!isClient) return <div className="min-h-[600px]" />;

  return (
    <>
      <FullCalendar
        plugins={[timeGridPlugin, classicThemePlugin]}
        initialView="timeGridWeek"
        initialDate={initialDate}
        headerToolbar={{ start: "title", end: "today prev,next" }}
        dayHeaderFormat={{ weekday: "short", month: "numeric", day: "numeric" }}
        weekends={false}
        allDaySlot={false}
        slotMinTime="08:00"
        slotMaxTime="21:00"
        height="auto"
        eventClick={(info) => {
          info.jsEvent.preventDefault();
          setSelectedId(info.event.id);
        }}
        events={items.map((m) => ({
          id: m.id,
          title: `${m.label} · ${m.roomName ?? "No room"}`,
          daysOfWeek: m.days.map((d) => DAY_INDEX[d]),
          startTime: hhmm(m.startMinute),
          endTime: hhmm(m.endMinute),
          startRecur: m.startRecur,
          endRecur: m.endRecur,
          color: m.hasProblem ? "#dc2626" : m.kind === "reservation" ? "#71717a" : "#4b9cd3",
          classNames: ["cursor-pointer"],
        }))}
      />
      <DetailDialog item={selected} onClose={() => setSelectedId(null)} />
    </>
  );
}

export const noopSubscribe = () => () => {};
