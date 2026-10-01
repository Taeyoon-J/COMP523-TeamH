import { describe, expect, it } from "vitest";
import { eventDifferences, eventToSlot, htmlToText, managedKey, meetingToEvent, roomResponse, type EventMeeting } from "./calendar-events";

const meeting: EventMeeting = {
  key: "R-1002",
  days: ["TUE", "THU"],
  startMinute: 660,
  endMinute: 735,
  startDate: new Date("2026-08-17T00:00:00Z"), // a Monday; first class is Tuesday
  endDate: new Date("2026-12-08T00:00:00Z"),
  courseCode: "COMP 210",
  section: "001",
  title: "Data Structures and Analysis",
  roomName: "FB 141",
  instructorName: null,
};

describe("meetingToEvent", () => {
  it("builds a weekly recurring event starting on the first class day", () => {
    const event = meetingToEvent(meeting);
    expect(event.start?.dateTime).toBe("2026-08-18T11:00:00");
    expect(event.end?.dateTime).toBe("2026-08-18T12:15:00");
    expect(event.recurrence).toEqual(["RRULE:FREQ=WEEKLY;BYDAY=TU,TH;UNTIL=20261208T235959Z"]);
    expect(managedKey(event)).toBe("R-1002");
  });

  it("round-trips through eventToSlot", () => {
    expect(eventToSlot(meetingToEvent(meeting))).toEqual({
      days: ["TUE", "THU"],
      startMinute: 660,
      endMinute: 735,
      startDate: new Date("2026-08-18T00:00:00Z"),
      endDate: new Date("2026-12-08T00:00:00Z"),
    });
  });
});

describe("eventToSlot", () => {
  it("reads a one-time event", () => {
    const slot = eventToSlot({ start: { dateTime: "2026-10-05T09:00:00-04:00" }, end: { dateTime: "2026-10-05T10:00:00-04:00" } });
    expect(slot).toEqual({
      days: ["MON"],
      startMinute: 540,
      endMinute: 600,
      startDate: new Date("2026-10-05T00:00:00Z"),
      endDate: new Date("2026-10-05T00:00:00Z"),
    });
  });

  it("skips all-day and non-weekly events", () => {
    expect(eventToSlot({ start: { date: "2026-10-15" }, end: { date: "2026-10-17" } })).toBeNull();
    expect(
      eventToSlot({
        start: { dateTime: "2026-10-05T09:00:00" },
        end: { dateTime: "2026-10-05T10:00:00" },
        recurrence: ["RRULE:FREQ=MONTHLY;BYDAY=1MO"],
      }),
    ).toBeNull();
  });
});

describe("eventDifferences", () => {
  it("reports changed fields and ignores UTC offsets", () => {
    const expected = meetingToEvent(meeting);
    const actual = {
      ...expected,
      location: "SN 014",
      start: { dateTime: "2026-08-18T11:00:00-04:00" },
      end: { dateTime: "2026-08-18T12:15:00-04:00" },
    };
    expect(eventDifferences(actual, expected)).toEqual([{ field: "room", actual: "SN 014", expected: "FB 141" }]);
  });

  it("does not treat events without our marker as managed", () => {
    expect(managedKey({ summary: "Faculty Meeting" })).toBeNull();
  });
});

describe("htmlToText", () => {
  it("keeps text and line breaks from an HTML description", () => {
    expect(htmlToText("Talk by a visiting researcher.<br>Open to <b>all</b> CS students &amp; staff.")).toBe(
      "Talk by a visiting researcher.\nOpen to all CS students & staff.",
    );
    expect(htmlToText("")).toBeNull();
    expect(htmlToText(undefined)).toBeNull();
  });
});

describe("roomResponse", () => {
  it("reads how the room answered the booking", () => {
    const event = { attendees: [{ email: "person@unc.edu", responseStatus: "accepted" }, { email: "fb009@room", responseStatus: "declined" }] };
    expect(roomResponse(event, "fb009@room")).toBe("declined");
    expect(roomResponse({ attendees: [{ self: true, responseStatus: "accepted" }] }, "fb009@room")).toBe("accepted");
    expect(roomResponse({}, "fb009@room")).toBeNull();
  });
});
