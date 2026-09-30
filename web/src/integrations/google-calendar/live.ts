// Real Google Calendar, read as the signed-in user (see oauth.ts).
import { google } from "googleapis";
import { MANAGED_BY, type CalendarEvent } from "@/lib/calendar-events";
import { ServiceError } from "@/services/errors";
import { authorizedClient, calendarWritesEnabled } from "./oauth";
import type { CalendarClient } from "./types";

export function liveCalendarClient(): CalendarClient {
  const calendar = google.calendar({ version: "v3", auth: authorizedClient() });
  const timeZone = process.env.CALENDAR_TIMEZONE || "America/New_York";
  const canWrite = calendarWritesEnabled();
  const assertWritable = () => {
    if (!canWrite) throw new ServiceError("Writing to Google Calendar is turned off. Set GOOGLE_CALENDAR_WRITE=true (use a test calendar!) and run google login again.");
  };

  return {
    mode: "live",
    canWrite,

    async listCalendars() {
      const calendars = [];
      let pageToken: string | undefined;
      do {
        const res = await calendar.calendarList.list({ maxResults: 250, pageToken });
        calendars.push(...(res.data.items ?? []).map((c) => ({ id: c.id!, summary: c.summaryOverride ?? c.summary ?? c.id! })));
        pageToken = res.data.nextPageToken ?? undefined;
      } while (pageToken);
      return calendars;
    },

    async listEvents(calendarId, options = {}) {
      const events: CalendarEvent[] = [];
      let pageToken: string | undefined;
      do {
        const res = await calendar.events.list({
          calendarId,
          timeMin: options.timeMin,
          timeMax: options.timeMax,
          singleEvents: options.expandRecurring ?? false,
          privateExtendedProperty: options.managedOnly ? [`managedBy=${MANAGED_BY}`] : undefined,
          timeZone,
          maxResults: 2500,
          pageToken,
        });
        events.push(...(res.data.items ?? []));
        pageToken = res.data.nextPageToken ?? undefined;
      } while (pageToken);
      return events;
    },

    async insertEvent(calendarId, event) {
      assertWritable();
      return (await calendar.events.insert({ calendarId, requestBody: event })).data;
    },

    async updateEvent(calendarId, eventId, event) {
      assertWritable();
      return (await calendar.events.update({ calendarId, eventId, requestBody: event })).data;
    },

    async deleteEvent(calendarId, eventId) {
      assertWritable();
      await calendar.events.delete({ calendarId, eventId });
    },
  };
}
