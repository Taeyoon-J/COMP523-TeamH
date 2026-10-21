import { describe, expect, it } from "vitest";
import { buildSheetRows, seriesId, SHEET_COLUMNS, toCsv, type SheetBooking } from "./sheet-rows";

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const booking = (date: string, id: string): SheetBooking => ({
  externalId: id,
  title: "Faculty Meeting",
  roomName: "FB141",
  days: ["WED"],
  startMinute: 930,
  endMinute: 990,
  startDate: d(date),
  endDate: d(date),
  description: "Monthly, all faculty",
  organizer: "CS Events",
  source: "GOOGLE_CALENDAR",
  cancelled: false,
  updatedAt: d("2026-10-01"),
});

describe("buildSheetRows", () => {
  it("merges the occurrences of a repeating event into one row", () => {
    const rows = buildSheetRows([], [booking("2026-10-07", "abc_20261007T193000Z"), booking("2026-10-14", "abc_20261014T193000Z")]);
    expect(rows[0]).toEqual(SHEET_COLUMNS);
    expect(rows).toHaveLength(2);
    expect(rows[1].slice(0, 8)).toEqual(["abc", "Booking", "Faculty Meeting", "FB141", "Wed", "2026-10-07 – 2026-10-14", "3:30 PM", "4:30 PM"]);
    expect(rows[1][11]).toBe("Active");
  });

  it("lists courses and cancelled bookings", () => {
    const rows = buildSheetRows(
      [
        {
          id: "F-0001",
          label: "COMP 523-001 Software Engineering Laboratory",
          roomName: "FB009",
          days: ["MON", "WED"],
          startMinute: 805,
          endMinute: 880,
          startDate: d("2026-08-18"),
          endDate: d("2026-12-09"),
          enrollment: 60,
          instructor: "Instructor A",
          source: "TWENTYFIVE_LIVE",
          updatedAt: d("2026-10-01"),
        },
      ],
      [{ ...booking("2026-10-07", "local-1"), cancelled: true, source: "LOCAL" }],
    );
    expect(rows.map((r) => r[1])).toEqual(["Type", "Course", "Booking"]);
    expect(rows[1][8]).toBe("Expected enrollment: 60");
    expect(rows[2].slice(10, 12)).toEqual(["This app", "Cancelled"]);
  });
});

describe("helpers", () => {
  it("strips the occurrence suffix from Google event IDs", () => {
    expect(seriesId("5beenq718cf4_20261007T183000Z")).toBe("5beenq718cf4");
    expect(seriesId("gcal-colloquium")).toBe("gcal-colloquium");
  });

  it("quotes CSV cells when needed", () => {
    expect(toCsv([["a", 'say "hi"', "x,y"]])).toBe('a,"say ""hi""","x,y"\n');
  });
});
