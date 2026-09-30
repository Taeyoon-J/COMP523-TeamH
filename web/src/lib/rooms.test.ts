import { describe, expect, it } from "vitest";
import { configuredRooms, parseRoomCalendarName } from "./rooms";

describe("parseRoomCalendarName", () => {
  it("reads room calendars", () => {
    expect(parseRoomCalendarName("FB007 seats 50")).toEqual({ name: "FB007", capacity: 50 });
    expect(parseRoomCalendarName("SN011 seats 55 (email for reservation requests)")).toEqual({ name: "SN011", capacity: 55 });
    expect(parseRoomCalendarName("FB 152 seats 8 (Open Meeting Space)")).toEqual({ name: "FB152", capacity: 8 });
  });

  it("ignores calendars that aren't rooms", () => {
    expect(parseRoomCalendarName("Student Name")).toBeNull();
    expect(parseRoomCalendarName("Holidays in United States")).toBeNull();
    expect(parseRoomCalendarName("Birthdays")).toBeNull();
  });
});

describe("configuredRooms", () => {
  it("loads config/rooms.json with canonical names", () => {
    const rooms = configuredRooms();
    expect(rooms.get("SN014")).toEqual({ name: "SN014", capacity: 120, category: "Classroom" });
    expect(rooms.size).toBe(13);
  });
});
