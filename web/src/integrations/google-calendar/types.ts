import type { CalendarEvent } from "@/lib/calendar-events";

export interface CalendarInfo {
  id: string;
  summary: string;
}

export interface ListEventsOptions {
  /** ISO timestamps bounding the events returned (live mode). */
  timeMin?: string;
  timeMax?: string;
  /**
   * true: expand recurring events into individual occurrences (what actually happens, incl. cancellations).
   * false: return recurring events as one event with an RRULE (what we write).
   */
  expandRecurring?: boolean;
  /** Only events this app created. */
  managedOnly?: boolean;
}

export interface CalendarClient {
  mode: "mock" | "live";
  /** Whether this client may create or change events. */
  canWrite: boolean;
  listCalendars(): Promise<CalendarInfo[]>;
  listEvents(calendarId: string, options?: ListEventsOptions): Promise<CalendarEvent[]>;
  insertEvent(calendarId: string, event: CalendarEvent): Promise<CalendarEvent>;
  updateEvent(calendarId: string, eventId: string, event: CalendarEvent): Promise<CalendarEvent>;
  deleteEvent(calendarId: string, eventId: string): Promise<void>;
}
