import { describe, expect, it } from "vitest";
import { isCourseMirror, parseCourseTitle } from "./course-match";

describe("parseCourseTitle", () => {
  it("reads the department's course event titles", () => {
    expect(parseCourseTitle("COMP 523.001 - FB009 (Instructor A)")).toEqual({ code: "COMP 523", section: "001", room: "FB009" });
    expect(parseCourseTitle("COMP 537 - SN011 (Instructor B)")).toEqual({ code: "COMP 537", section: null, room: "SN011" });
    expect(parseCourseTitle("COMP 690.175 - FB007(Instructor D)")).toEqual({ code: "COMP 690", section: "175", room: "FB007" });
    expect(parseCourseTitle("COMP 89 - SN115 (Instructor E)")).toEqual({ code: "COMP 89", section: null, room: "SN115" });
  });

  it("ignores events that aren't course sections", () => {
    expect(parseCourseTitle("COMP110 Weekly GTA/Instructor Meeting")).toBeNull();
    expect(parseCourseTitle("Faculty Meeting")).toBeNull();
  });
});

describe("isCourseMirror", () => {
  const course = { code: "COMP 562", section: "001", roomName: "FB009", days: ["TUE", "THU"] as const, startMinute: 840, endMinute: 915 };
  const booking = { title: "COMP 562 - FB009 (Instructor C)", roomName: "FB009", days: ["TUE"] as const, startMinute: 840, endMinute: 915 };

  it("matches the calendar copy of a course", () => {
    expect(isCourseMirror({ ...booking, days: [...booking.days] }, [{ ...course, days: [...course.days] }])).toBe(true);
  });

  it("does not match a different room, time or section", () => {
    const c = { ...course, days: [...course.days] };
    expect(isCourseMirror({ ...booking, days: ["TUE"], roomName: "SN011" }, [c])).toBe(false);
    expect(isCourseMirror({ ...booking, days: ["TUE"], startMinute: 845 }, [c])).toBe(false);
    expect(isCourseMirror({ ...booking, days: ["TUE"], title: "COMP 562.002 - FB009" }, [c])).toBe(false);
    expect(isCourseMirror({ ...booking, days: ["TUE"], title: "Faculty Meeting" }, [c])).toBe(false);
  });
});
