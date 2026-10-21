// Fake 25Live that serves dummy data from fixtures/25live/<set>/. Pick the set with
// TWENTYFIVE_LIVE_FIXTURE: "demo" (small made-up schedule, the default) or "fall2026"
// (built from the department's real room calendars by scripts/generate-25live-fixture.ts).
import demoReservations from "../../../fixtures/25live/demo/reservations.json";
import demoSpaces from "../../../fixtures/25live/demo/spaces.json";
import fallReservations from "../../../fixtures/25live/fall2026/reservations.json";
import fallSpaces from "../../../fixtures/25live/fall2026/spaces.json";
import type { TwentyFiveLiveClient, TwentyFiveLiveReservation, TwentyFiveLiveSpace } from "./types";

const SETS: Record<string, { spaces: unknown[]; reservations: unknown[] }> = {
  demo: { spaces: demoSpaces, reservations: demoReservations },
  fall2026: { spaces: fallSpaces, reservations: fallReservations },
};

function fixture() {
  const name = process.env.TWENTYFIVE_LIVE_FIXTURE || "demo";
  const set = SETS[name];
  if (!set) throw new Error(`Unknown TWENTYFIVE_LIVE_FIXTURE "${name}". Use ${Object.keys(SETS).join(" or ")}.`);
  return set;
}

export const mockTwentyFiveLiveClient: TwentyFiveLiveClient = {
  mode: "mock",

  async listSpaces() {
    return structuredClone(fixture().spaces) as TwentyFiveLiveSpace[];
  },

  async listReservations(termCode) {
    const all = structuredClone(fixture().reservations) as TwentyFiveLiveReservation[];
    return termCode ? all.filter((r) => r.term_code === termCode) : all;
  },
};
