"use client";

import { createContext, useContext } from "react";
import type { CalendarItem } from "./ScheduleCalendar";

/** Edit actions the detail dialog can offer, provided by the explorer. */
export interface ScheduleActions {
  canEdit: boolean;
  editBooking: (item: CalendarItem) => void;
  cancelBookings: (ids: string[], what: string) => Promise<boolean>;
  /** Opens the resolve dialog for a conflict that involves this item, if there is one. */
  resolveFor: (item: CalendarItem) => boolean;
  /** Every date of the repeating booking this item belongs to. */
  seriesIds: (item: CalendarItem) => string[];
}

export const ScheduleActionsContext = createContext<ScheduleActions | null>(null);

export function useScheduleActions(): ScheduleActions | null {
  return useContext(ScheduleActionsContext);
}

export interface ApiResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
  details?: { conflicts?: { with: string }[] };
}

export async function sendJson<T>(url: string, body: unknown, method: "POST" | "PATCH" = "POST"): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    return res.ok ? { ok: true, data: json as T } : { ok: false, error: json.error ?? `Request failed (${res.status}).`, details: json.details };
  } catch (err) {
    return { ok: false, error: `Could not reach the server: ${(err as Error).message}` };
  }
}

/** Collects the user-facing follow-up messages (calendar, spreadsheet) from an API response. */
export function followUps(data: unknown): string[] {
  const d = data as { calendarSync?: { message?: string }; sheetSync?: { message?: string }; summary?: string[] } | undefined;
  const lines = [...(d?.summary ?? []), d?.calendarSync?.message, d?.sheetSync?.message].filter((m): m is string => Boolean(m) && m !== "Done.");
  return [...new Set(lines)];
}
