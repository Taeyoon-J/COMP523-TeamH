// Fake Google Calendar backed by a JSON file, seeded from fixtures/google-calendar/.
// Like the department's setup, there is one calendar per room. Delete .mock-data/
// (or run `npm run cli -- reset --yes`) to start over.
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { managedKey, type CalendarEvent } from "@/lib/calendar-events";
import fixtureCalendars from "../../../fixtures/google-calendar/calendars.json";
import fixtureEvents from "../../../fixtures/google-calendar/events.json";
import type { CalendarClient } from "./types";

type StoredEvent = CalendarEvent & { calendarId: string };

export function mockCalendarPath(): string {
  return path.join(process.cwd(), process.env.MOCK_DATA_DIR || ".mock-data", "google-calendar.json");
}

export function resetMockCalendar(): void {
  fs.rmSync(mockCalendarPath(), { force: true });
}

function load(): StoredEvent[] {
  try {
    return JSON.parse(fs.readFileSync(mockCalendarPath(), "utf8"));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return structuredClone(fixtureEvents) as StoredEvent[];
    throw err;
  }
}

function save(events: StoredEvent[]): void {
  fs.mkdirSync(path.dirname(mockCalendarPath()), { recursive: true });
  fs.writeFileSync(mockCalendarPath(), JSON.stringify(events, null, 2) + "\n");
}

function strip(stored: StoredEvent): CalendarEvent {
  const event: Partial<StoredEvent> = { ...stored };
  delete event.calendarId;
  return event as CalendarEvent;
}

export const mockCalendarClient: CalendarClient = {
  mode: "mock",
  canWrite: true,

  async listCalendars() {
    return structuredClone(fixtureCalendars);
  },

  // The mock keeps recurring events as a single event, so `expandRecurring` and the time window are ignored.
  async listEvents(calendarId, options = {}) {
    return load()
      .filter((e) => e.calendarId === calendarId && (!options.managedOnly || managedKey(e)))
      .map(strip);
  },

  async insertEvent(calendarId, event) {
    const events = load();
    const created: StoredEvent = { ...event, calendarId, id: `mock-${randomUUID().slice(0, 8)}`, updated: new Date().toISOString() };
    events.push(created);
    save(events);
    return strip(created);
  },

  async updateEvent(calendarId, eventId, event) {
    const events = load();
    const index = events.findIndex((e) => e.id === eventId && e.calendarId === calendarId);
    if (index === -1) throw new Error(`Event ${eventId} not found in mock calendar ${calendarId}`);
    events[index] = { ...event, calendarId, id: eventId, updated: new Date().toISOString() };
    save(events);
    return strip(events[index]);
  },

  async deleteEvent(calendarId, eventId) {
    save(load().filter((e) => !(e.id === eventId && e.calendarId === calendarId)));
  },
};
