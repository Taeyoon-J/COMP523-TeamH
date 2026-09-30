import { describe, expect, it } from "vitest";
import { checkCapacity, conflictsForProposal, findConflicts, formatMinute, parseDayPattern, parseTime, type MeetingSlot } from "./scheduling";

const term = { startDate: new Date("2026-08-18"), endDate: new Date("2026-12-08") };

function slot(overrides: Partial<MeetingSlot>): MeetingSlot {
  return { id: "m", roomId: "sn014", days: ["MON", "WED", "FRI"], startMinute: 545, endMinute: 595, ...term, ...overrides };
}

describe("findConflicts", () => {
  it("flags two meetings in the same room at overlapping times", () => {
    const conflicts = findConflicts([slot({ id: "a" }), slot({ id: "b", days: ["WED"], startMinute: 570, endMinute: 620 })]);
    expect(conflicts).toEqual([{ meetingId: "a", otherMeetingId: "b", roomId: "sn014", days: ["WED"] }]);
  });

  it("ignores back-to-back meetings", () => {
    expect(findConflicts([slot({ id: "a" }), slot({ id: "b", startMinute: 595, endMinute: 645 })])).toEqual([]);
  });

  it("ignores different rooms, different days, and unassigned rooms", () => {
    expect(
      findConflicts([
        slot({ id: "a" }),
        slot({ id: "b", roomId: "fb009" }),
        slot({ id: "c", days: ["TUE", "THU"] }),
        slot({ id: "d", roomId: null }),
      ]),
    ).toEqual([]);
  });

  it("ignores non-overlapping date ranges", () => {
    const later = { startDate: new Date("2027-01-10"), endDate: new Date("2027-05-01") };
    expect(findConflicts([slot({ id: "a" }), slot({ id: "b", ...later })])).toEqual([]);
  });
});

describe("conflictsForProposal", () => {
  it("does not report a meeting as conflicting with its current self", () => {
    const current = slot({ id: "a" });
    expect(conflictsForProposal({ ...current, startMinute: 550 }, [current])).toEqual([]);
  });
});

describe("checkCapacity", () => {
  it("flags rooms smaller than expected enrollment", () => {
    expect(checkCapacity("a", { id: "sn014", capacity: 40 }, 60)).toEqual({
      meetingId: "a",
      roomId: "sn014",
      capacity: 40,
      expectedEnrollment: 60,
    });
    expect(checkCapacity("a", { id: "sn014", capacity: 60 }, 60)).toBeNull();
    expect(checkCapacity("a", null, 60)).toBeNull();
  });
});

describe("formatMinute", () => {
  it("formats minutes after midnight", () => {
    expect(formatMinute(545)).toBe("9:05 AM");
    expect(formatMinute(720)).toBe("12:00 PM");
    expect(formatMinute(0)).toBe("12:00 AM");
  });
});

describe("parseDayPattern", () => {
  it("reads registrar patterns and day names", () => {
    expect(parseDayPattern("MWF")).toEqual(["MON", "WED", "FRI"]);
    expect(parseDayPattern("tr")).toEqual(["TUE", "THU"]);
    expect(parseDayPattern("wed,mon")).toEqual(["MON", "WED"]);
    expect(parseDayPattern("SAT")).toEqual(["SAT"]);
  });

  it("rejects nonsense", () => {
    expect(() => parseDayPattern("XYZ")).toThrow();
    expect(() => parseDayPattern("")).toThrow();
  });
});

describe("parseTime", () => {
  it("reads 24-hour and am/pm times", () => {
    expect(parseTime("9:05")).toBe(545);
    expect(parseTime("15:30")).toBe(930);
    expect(parseTime("3:30pm")).toBe(930);
    expect(parseTime("12am")).toBe(0);
  });

  it("rejects invalid times", () => {
    expect(() => parseTime("25:00")).toThrow();
    expect(() => parseTime("noon")).toThrow();
  });
});
