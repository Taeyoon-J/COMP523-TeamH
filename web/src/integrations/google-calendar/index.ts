import { integrationMode } from "../types";
import { liveCalendarClient } from "./live";
import { mockCalendarClient } from "./mock";
import type { CalendarClient } from "./types";

export type { CalendarClient, CalendarInfo } from "./types";
export { mockCalendarPath, resetMockCalendar } from "./mock";
export { loginWithBrowser, tokenPath } from "./oauth";

/** GOOGLE_CALENDAR_MODE=live uses the real API; anything else uses the mock. */
export function getCalendarClient(): CalendarClient {
  return integrationMode("GOOGLE_CALENDAR_MODE") === "live" ? liveCalendarClient() : mockCalendarClient;
}
