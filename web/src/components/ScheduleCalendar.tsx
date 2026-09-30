"use client";

import "temporal-polyfill/global";
import FullCalendar from "@fullcalendar/react";
import classicThemePlugin from "@fullcalendar/react/themes/classic";
import timeGridPlugin from "@fullcalendar/react/timegrid";
import "@fullcalendar/react/skeleton.css";
import "@fullcalendar/react/themes/classic/theme.css";
import "@fullcalendar/react/themes/classic/palette.css";
import { useSyncExternalStore } from "react";

const DAY_INDEX = { SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6 } as const;

export interface CalendarMeeting {
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
}

const hhmm = (minute: number) => `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;

/** Weekly view of all meetings (FR-3, I-2). Courses are blue, calendar reservations gray, anything with a problem red (I-7). */
export default function ScheduleCalendar({ meetings }: { meetings: CalendarMeeting[] }) {
  // Render in the browser only: server and browser Intl output differ slightly (e.g. spaces in "9:05 – 9:55"),
  // which breaks hydration.
  const isClient = useSyncExternalStore(noopSubscribe, () => true, () => false);
  if (!isClient) return <div className="min-h-[600px]" />;

  return (
    <FullCalendar
      plugins={[timeGridPlugin, classicThemePlugin]}
      initialView="timeGridWeek"
      headerToolbar={false}
      dayHeaderFormat={{ weekday: "short" }}
      weekends={false}
      allDaySlot={false}
      slotMinTime="08:00"
      slotMaxTime="19:00"
      height="auto"
      events={meetings.map((m) => ({
        id: m.id,
        title: `${m.label} · ${m.roomName ?? "No room"}`,
        daysOfWeek: m.days.map((d) => DAY_INDEX[d]),
        startTime: hhmm(m.startMinute),
        endTime: hhmm(m.endMinute),
        startRecur: m.startRecur,
        endRecur: m.endRecur,
        color: m.hasProblem ? "#dc2626" : m.kind === "reservation" ? "#71717a" : "#4b9cd3",
      }))}
    />
  );
}

const noopSubscribe = () => () => {};
