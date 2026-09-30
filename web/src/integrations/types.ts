/** "mock" reads bundled dummy data from fixtures/; "live" calls the real service; "off" disables it. */
export type IntegrationMode = "mock" | "live" | "off";

export function integrationMode(envVar: string): IntegrationMode {
  const value = process.env[envVar];
  return value === "live" || value === "off" ? value : "mock";
}
