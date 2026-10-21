// Builds fixtures/25live/fall2026/ — dummy 25Live data shaped like the department's real schedule —
// from the course events in the real room calendars (run `npm run cli -- pull` in live mode first).
//
//   npx tsx scripts/generate-25live-fixture.ts
//
// Only course codes, sections, rooms and times are copied. Titles come from a short list of known
// course names, and instructors and enrollments are made up. Three sections are deliberately put in a
// room that is already booked at that time, so the app has conflicts to show and resolve.
import fs from "node:fs";
import path from "node:path";
import { prisma } from "../src/lib/prisma";
import { parseCourseTitle } from "../src/lib/course-match";
import { seriesId } from "../src/lib/sheet-rows";
import { configuredRooms } from "../src/lib/rooms";
import { buildingName } from "../src/lib/room-search";
import { toDateString, WEEKDAYS, type Weekday } from "../src/lib/scheduling";

try {
  process.loadEnvFile(".env");
} catch {}

const TERM = "2026FA";
const TERM_START = "2026-08-18";
const CONFLICTS_WANTED = 3;
const LETTER: Record<Weekday, string> = { MON: "M", TUE: "T", WED: "W", THU: "R", FRI: "F", SAT: "S", SUN: "U" };
const TITLES: Record<string, string> = {
  "COMP 89": "First-Year Seminar",
  "COMP 110": "Introduction to Programming and Data Science",
  "COMP 210": "Data Structures and Analysis",
  "COMP 211": "Systems Fundamentals",
  "COMP 301": "Foundations of Programming",
  "COMP 311": "Computer Organization",
  "COMP 421": "Files and Databases",
  "COMP 426": "Modern Web Programming",
  "COMP 433": "Mobile Computing Systems",
  "COMP 455": "Models of Languages and Computation",
  "COMP 520": "Compilers",
  "COMP 523": "Software Engineering Laboratory",
  "COMP 537": "Cryptography",
  "COMP 550": "Algorithms and Analysis",
  "COMP 560": "Artificial Intelligence",
  "COMP 562": "Introduction to Machine Learning",
  "COMP 590": "Special Topics",
  "COMP 690": "Special Topics",
  "COMP 790": "Special Topics",
};

interface Group {
  code: string;
  section: string;
  room: string;
  days: Set<Weekday>;
  startMinute: number;
  endMinute: number;
  last: string;
}

const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
/** Stable pseudo-random number in [0, 1) from a string, so reruns give the same enrollments. */
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) / 2 ** 32;

async function main() {
  const rooms = configuredRooms();
  const reservations = await prisma.roomReservation.findMany({ where: { status: "ACTIVE" }, include: { room: true } });
  if (!reservations.length) throw new Error('No calendar data. Run "npm run cli -- pull" with GOOGLE_CALENDAR_MODE=live first.');

  // One group per section meeting pattern (same course, room and time; days merged).
  const groups = new Map<string, Group>();
  for (const r of reservations) {
    const parsed = parseCourseTitle(r.title);
    if (!parsed || parsed.room !== r.room.name) continue; // skip events whose title names a different room
    const section = parsed.section ?? "001";
    const key = [parsed.code, section, r.room.name, r.startMinute, r.endMinute].join("|");
    const g = groups.get(key) ?? { code: parsed.code, section, room: r.room.name, days: new Set(), startMinute: r.startMinute, endMinute: r.endMinute, last: "" };
    r.days.forEach((d) => g.days.add(d));
    const date = toDateString(r.endDate);
    if (date > g.last) g.last = date;
    groups.set(key, g);
  }

  const sorted = [...groups.values()].sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }) || a.section.localeCompare(b.section));
  const enrollment = (g: Group) => {
    const cap = rooms.get(g.room)?.capacity ?? 30;
    return Math.max(8, Math.round(cap * (0.5 + 0.4 * hash(`${g.code}.${g.section}`))));
  };

  // Pick sections to move into a classroom that is already booked at that time: one per course,
  // in a stable shuffled order, with the first clash against a non-course booking for variety.
  const moves = new Map<Group, { to: string; clashesWith: string }>();
  const usedRooms = new Set<string>();
  const usedCodes = new Set<string>();
  const candidates = [...sorted].sort((a, b) => hash(`${a.code}${a.section}${a.startMinute}`) - hash(`${b.code}${b.section}${b.startMinute}`));
  for (const g of candidates) {
    if (moves.size >= CONFLICTS_WANTED) break;
    if (usedCodes.has(g.code) || usedRooms.has(g.room)) continue;
    const wantNonCourse = moves.size === 0;
    for (const [name, room] of rooms) {
      if (name === g.room || room.category !== "Classroom" || room.capacity < enrollment(g) || usedRooms.has(name)) continue;
      const clashes = reservations.filter(
        (r) =>
          r.room.name === name &&
          r.startMinute < g.endMinute &&
          g.startMinute < r.endMinute &&
          r.days.some((d) => g.days.has(d)) &&
          (!wantNonCourse || !/^\s*COMP\s*\d/i.test(r.title)),
      );
      // Exactly one other booking (one series), so each move makes exactly one conflict.
      const series = new Set(clashes.map((r) => `${r.title}|${seriesId(r.externalId)}`));
      const clash = series.size === 1 ? clashes[0] : undefined;
      if (clash) {
        moves.set(g, { to: name, clashesWith: clash.title });
        usedRooms.add(name).add(g.room);
        usedCodes.add(g.code);
        break;
      }
    }
  }

  const spaceIds = new Map([...rooms.keys()].map((name, i) => [name, 300 + i]));
  const spaces = [...rooms.values()].map((r) => ({
    space_id: spaceIds.get(r.name),
    space_name: r.name,
    building_name: buildingName(r.name),
    max_capacity: r.capacity,
  }));
  const out = sorted.map((g, i) => {
    const room = moves.get(g)?.to ?? g.room;
    const catalog = g.code.replace("COMP ", "");
    const title = TITLES[g.code] ?? "(course title not in sample data)";
    return {
      reservation_id: `F-${String(i + 1).padStart(4, "0")}`,
      event_name: `${g.code}-${g.section}: ${title}`,
      subject: "COMP",
      catalog_number: catalog,
      section: g.section,
      title,
      instructor: `Instructor ${String.fromCharCode(65 + (i % 26))}${i >= 26 ? Math.floor(i / 26) : ""}`,
      expected_head_count: enrollment(g),
      space_id: spaceIds.get(room) ?? null,
      meeting_pattern: { days: WEEKDAYS.filter((d) => g.days.has(d)).map((d) => LETTER[d]).join(""), start_time: hhmm(g.startMinute), end_time: hhmm(g.endMinute) },
      term_code: TERM,
      start_date: TERM_START,
      end_date: g.last,
    };
  });

  const dir = path.join(process.cwd(), "fixtures", "25live", "fall2026");
  fs.writeFileSync(path.join(dir, "spaces.json"), JSON.stringify(spaces, null, 2) + "\n");
  fs.writeFileSync(path.join(dir, "reservations.json"), JSON.stringify(out, null, 2) + "\n");
  console.log(`Wrote ${out.length} course meetings and ${spaces.length} rooms to fixtures/25live/fall2026/`);
  for (const [g, m] of moves) console.log(`  conflict: ${g.code}.${g.section} moved ${g.room} → ${m.to}, clashes with "${m.clashesWith}"`);
}

main().finally(() => prisma.$disconnect());
