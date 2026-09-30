import roomConfig from "../../config/rooms.json";
import { normalizeRoomName } from "./scheduling";

export interface RoomInfo {
  name: string;
  capacity: number;
  category: string | null;
}

/**
 * Reads a room calendar's name, e.g. "FB009 seats 80 (email for reservation requests)" -> FB009, 80 seats.
 * Returns null for calendars that aren't rooms ("Birthdays", "Holidays in United States").
 */
export function parseRoomCalendarName(summary: string): { name: string; capacity: number } | null {
  const match = /^\s*([A-Z]{2,4})\s*-?\s*(\d{2,4}[A-Z]?)\s+seats\s+(\d+)/i.exec(summary);
  if (!match) return null;
  return { name: normalizeRoomName(match[1] + match[2]), capacity: Number(match[3]) };
}

/** The room list in config/rooms.json, keyed by canonical name. */
export function configuredRooms(): Map<string, RoomInfo> {
  return new Map(
    roomConfig.rooms.map((r) => [normalizeRoomName(r.name), { name: normalizeRoomName(r.name), capacity: r.capacity, category: r.category ?? null }]),
  );
}
