import { describe, expect, it } from "vitest";
import reservations from "../../../fixtures/25live/reservations.json";
import { mapReservation } from "./map";
import type { TwentyFiveLiveReservation } from "./types";

describe("mapReservation", () => {
  it("maps every fixture reservation", () => {
    for (const r of reservations as TwentyFiveLiveReservation[]) expect(() => mapReservation(r)).not.toThrow();
  });

  it("converts the meeting pattern", () => {
    const m = mapReservation((reservations as TwentyFiveLiveReservation[]).find((r) => r.reservation_id === "R-1007")!);
    expect(m).toMatchObject({ code: "COMP 523", section: "001", days: ["TUE", "THU"], startMinute: 930, endMinute: 1005, spaceId: 101 });
  });
});
