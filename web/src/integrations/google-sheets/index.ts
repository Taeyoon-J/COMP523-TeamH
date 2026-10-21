// Where the events spreadsheet lives. SHEETS_MODE=mock (default) writes a CSV file under .mock-data/,
// live writes the Google Sheet in GOOGLE_SHEET_ID, off turns it off.
import fs from "node:fs";
import path from "node:path";
import { google } from "googleapis";
import { toCsv } from "@/lib/sheet-rows";
import { ServiceError } from "@/services/errors";
import { authorizedClient } from "../google-calendar/oauth";
import { integrationMode } from "../types";

export interface SheetClient {
  mode: "mock" | "live";
  /** Where the rows go, for messages ("Events tab of …", a file path). */
  target: string;
  /** Replaces the whole table, header row first. */
  writeTable(rows: string[][]): Promise<void>;
}

export function sheetsEnabled(): boolean {
  return integrationMode("SHEETS_MODE") !== "off";
}

export function getSheetClient(): SheetClient | null {
  const mode = integrationMode("SHEETS_MODE");
  if (mode === "off") return null;
  return mode === "live" ? liveSheetClient() : mockSheetClient();
}

export function mockSheetPath(): string {
  return path.resolve(process.cwd(), process.env.MOCK_DATA_DIR || ".mock-data", "events-sheet.csv");
}

function mockSheetClient(): SheetClient {
  const file = mockSheetPath();
  return {
    mode: "mock",
    target: file,
    async writeTable(rows) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, toCsv(rows));
    },
  };
}

function liveSheetClient(): SheetClient {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  if (!spreadsheetId) throw new ServiceError("SHEETS_MODE=live needs GOOGLE_SHEET_ID in .env (the long ID in the sheet's URL).");
  const tab = process.env.GOOGLE_SHEET_TAB || "Events";
  const sheets = google.sheets({ version: "v4", auth: authorizedClient() });

  return {
    mode: "live",
    target: `"${tab}" tab of spreadsheet ${spreadsheetId}`,
    async writeTable(rows) {
      // Write to our own tab, so nothing else in the client's spreadsheet is touched.
      const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties.title" });
      if (!meta.data.sheets?.some((s) => s.properties?.title === tab)) {
        await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: [{ addSheet: { properties: { title: tab } } }] } });
      }
      await sheets.spreadsheets.values.clear({ spreadsheetId, range: tab });
      await sheets.spreadsheets.values.update({ spreadsheetId, range: `${tab}!A1`, valueInputOption: "RAW", requestBody: { values: rows } });
    },
  };
}
