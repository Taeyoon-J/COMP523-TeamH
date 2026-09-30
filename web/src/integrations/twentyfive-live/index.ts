import { integrationMode } from "../types";
import { mockTwentyFiveLiveClient } from "./mock";
import type { TwentyFiveLiveClient } from "./types";

export type { TwentyFiveLiveClient };

export function twentyFiveLiveEnabled(): boolean {
  return integrationMode("TWENTYFIVE_LIVE_MODE") !== "off";
}

/** TWENTYFIVE_LIVE_MODE=live will call the real API once we have access; for now only the mock exists. */
export function getTwentyFiveLiveClient(): TwentyFiveLiveClient {
  const mode = integrationMode("TWENTYFIVE_LIVE_MODE");
  if (mode === "off") throw new Error("25Live is turned off (TWENTYFIVE_LIVE_MODE=off).");
  if (mode === "live") {
    throw new Error("25Live live mode isn't implemented yet (waiting on API access). Unset TWENTYFIVE_LIVE_MODE to use mock data.");
  }
  return mockTwentyFiveLiveClient;
}
