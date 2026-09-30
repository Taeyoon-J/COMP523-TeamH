// Fake 25Live that serves the dummy data in fixtures/25live/. Edit those files to try other scenarios.
import reservations from "../../../fixtures/25live/reservations.json";
import spaces from "../../../fixtures/25live/spaces.json";
import type { TwentyFiveLiveClient, TwentyFiveLiveReservation, TwentyFiveLiveSpace } from "./types";

export const mockTwentyFiveLiveClient: TwentyFiveLiveClient = {
  mode: "mock",

  async listSpaces() {
    return structuredClone(spaces) as TwentyFiveLiveSpace[];
  },

  async listReservations(termCode) {
    const all = structuredClone(reservations) as TwentyFiveLiveReservation[];
    return termCode ? all.filter((r) => r.term_code === termCode) : all;
  },
};
