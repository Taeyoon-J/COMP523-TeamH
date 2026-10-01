import { describe, expect, it } from "vitest";
import { EMPTY_QUERY, matchesRoom, parseSearch, roomAvailability, type BusySlot } from "./room-search";

describe("parseSearch", () => {
  it("reads room names and fragments", () => {
    expect(parseSearch("SN014").roomText).toBe("SN014");
    expect(parseSearch("sn 014").roomText).toBe("SN014");
    expect(parseSearch("SN").roomText).toBe("SN");
    expect(parseSearch("009").roomText).toBe("009");
    expect(parseSearch("fred brooks").roomText).toBe("FB");
    expect(parseSearch("Sitterson Hall").roomText).toBe("SN");
  });

  it("reads a class description", () => {
    expect(parseSearch("Wednesday 1:15 min class with capacity at least 50")).toMatchObject({
      roomText: "",
      days: ["WED"],
      duration: 75,
      startMinute: null,
      minCapacity: 50,
    });
  });

  it("tells a start time from a length", () => {
    expect(parseSearch("wed at 1:15 75 min")).toMatchObject({ days: ["WED"], startMinute: 795, duration: 75 });
    expect(parseSearch("TR 2pm 40+ seats")).toMatchObject({ days: ["TUE", "THU"], startMinute: 840, minCapacity: 40 });
    expect(parseSearch("mwf 9:05am 50 min")).toMatchObject({ days: ["MON", "WED", "FRI"], startMinute: 545, duration: 50 });
    expect(parseSearch("friday 1.5 hours")).toMatchObject({ days: ["FRI"], duration: 90 });
  });

  it("reads room types, dates and seat counts", () => {
    expect(parseSearch("conference rooms 10+")).toMatchObject({ category: "Conference Room", minCapacity: 10 });
    expect(parseSearch("classroom 2026-10-05 at 9am")).toMatchObject({ category: "Classroom", date: "2026-10-05", startMinute: 540 });
    expect(parseSearch("FB 60 seats")).toMatchObject({ roomText: "FB", minCapacity: 60 });
  });
});

describe("matchesRoom", () => {
  const room = { name: "FB009", capacity: 80, category: "Classroom" };
  it("filters by name fragment, seats and type", () => {
    expect(matchesRoom(room, { ...EMPTY_QUERY, roomText: "009" })).toBe(true);
    expect(matchesRoom(room, { ...EMPTY_QUERY, roomText: "SN" })).toBe(false);
    expect(matchesRoom(room, { ...EMPTY_QUERY, minCapacity: 81 })).toBe(false);
    expect(matchesRoom(room, { ...EMPTY_QUERY, category: "Conference Room" })).toBe(false);
  });
});

describe("roomAvailability", () => {
  const range = { from: "2026-10-05", to: "2026-10-18" }; // two weeks: Wednesdays 10/7 and 10/14
  const weekly: BusySlot = { label: "COMP 301", days: ["MON", "WED"], startMinute: 805, endMinute: 880, startDate: "2026-08-19", endDate: "2026-12-08" };
  const once: BusySlot = { label: "Talk", days: ["WED"], startMinute: 600, endMinute: 660, startDate: "2026-10-14", endDate: "2026-10-14" };

  it("finds windows free on every matching weekday", () => {
    const a = roomAvailability([weekly, once], { ...EMPTY_QUERY, days: ["WED"], duration: 75 }, range, { start: 480, end: 1080 })!;
    expect(a.dates).toBe(2);
    expect(a.freeWindows).toEqual([
      { start: 480, end: 600 },
      { start: 660, end: 805 },
      { start: 880, end: 1080 },
    ]);
    expect(a.fits).toBe(true);
  });

  it("names what blocks a requested start time", () => {
    const a = roomAvailability([weekly, once], { ...EMPTY_QUERY, days: ["WED"], startMinute: 795, duration: 75 }, range)!;
    expect(a.fits).toBe(false);
    expect(a.blockers).toEqual(["COMP 301"]);
  });

  it("checks a single date", () => {
    const a = roomAvailability([weekly, once], { ...EMPTY_QUERY, date: "2026-10-07", startMinute: 600, duration: 60 }, range)!;
    expect(a).toMatchObject({ fits: true, dates: 1 });
  });

  it("returns null without a day or date", () => {
    expect(roomAvailability([weekly], { ...EMPTY_QUERY, minCapacity: 50 }, range)).toBeNull();
  });
});
