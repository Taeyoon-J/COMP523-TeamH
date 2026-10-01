// Command-line interface for the scheduling system. Run `npm run cli -- help`.
import os from "node:os";
import { parseArgs } from "node:util";
import fs from "node:fs";
import { loginWithBrowser, mockCalendarPath, tokenPath } from "@/integrations/google-calendar";
import { calendarWritesEnabled } from "@/integrations/google-calendar/oauth";
import { twentyFiveLiveEnabled } from "@/integrations/twentyfive-live";
import { integrationMode } from "@/integrations/types";
import { eventToSlot, managedKey, roomResponse } from "@/lib/calendar-events";
import { prisma } from "@/lib/prisma";
import { getSchedule } from "@/lib/schedule-data";
import {
  formatDays,
  formatTimeRange,
  normalizeRoomName,
  parseDayPattern,
  parseTime,
  toDateString,
  WEEKDAYS,
  weekdayOf,
} from "@/lib/scheduling";
import { buildingName, describeQuery, describeWindows, hasTimeQuery, matchesRoom, parseSearch, roomAvailability } from "@/lib/room-search";
import { loadOccupants } from "@/services/occupancy";
import { assignMeeting, type AssignmentChanges, type AssignmentResult } from "@/services/assignments";
import { findAvailableRooms, termDates } from "@/services/availability";
import { ServiceError } from "@/services/errors";
import {
  defaultWindow,
  diffCalendar,
  listCalendarEvents,
  pullReservationsFromCalendar,
  pushAllToCalendar,
  syncRoomsFromCalendars,
} from "@/services/google-calendar-sync";
import { courseLabel } from "@/services/labels";
import { resetAll } from "@/services/reset";
import { importFrom25Live } from "@/services/twentyfive-live-import";
import { bold, dim, green, heading, red, table, yellow } from "./format";

try {
  process.loadEnvFile(".env");
} catch {
  // No .env: fall back to defaults (mock integrations).
}

const HELP = `
${bold("UNC CS classroom scheduling CLI")}

Usage: npm run cli -- <command> [options]

${bold("Data sources")} ${dim("(dummy data by default — see GOOGLE_CALENDAR_MODE / TWENTYFIVE_LIVE_MODE)")}
  google login              Sign in to Google (for GOOGLE_CALENDAR_MODE=live)
  google calendars          Which of your calendars are room calendars
  pull [--from D] [--to D]  Rooms + their events from the room calendars (default: this week + 16 weeks)
  import [--overwrite]      Rooms and course meetings from 25Live
  refresh                   pull + import
  push                      Write course meetings to their room calendars
  calendar [--room R]       Events on the room calendars (--from/--to, default: this week)
  calendar diff             Where the calendars disagree with the course schedule

${bold("Schedule")}
  rooms                     Rooms, seats, and linked calendars
  search "<text>"           Find rooms by name or by the class you need, e.g.
                            search FB · search "Wednesday 1:15 min class with capacity at least 50"
  schedule [--room R] [--day D] [--course C]
  problems                  Room conflicts, capacity issues, unassigned courses
  availability --day D --start T --end T [--date YYYY-MM-DD] [--min-capacity N]
  assign <course> [--room R|none] [--days D] [--start T] [--end T] [--dry-run] [--no-sync]
  history [--limit N]       Recent changes
  status                    Data source modes and last sync times
  reset --yes               Delete all local data and the mock calendar

Days: MWF, TR, MON,WED     Times: 9:05, 15:30, 3:30pm

${bold("Try")}
  npm run cli -- refresh
  npm run cli -- rooms
  npm run cli -- problems
  npm run cli -- availability --day TR --start 14:00 --end 15:15 --min-capacity 45
  npm run cli -- assign "COMP 421-001" --room "FB 008" --dry-run
  npm run cli -- calendar diff
`;

type Options = {
  room?: string;
  day?: string;
  days?: string;
  course?: string;
  start?: string;
  end?: string;
  date?: string;
  "min-capacity"?: string;
  from?: string;
  to?: string;
  limit?: string;
  "dry-run"?: boolean;
  "no-sync"?: boolean;
  overwrite?: boolean;
  yes?: boolean;
  help?: boolean;
};

const commands: Record<string, (args: string[], opts: Options) => Promise<void>> = {
  async import(_args, opts) {
    if (!twentyFiveLiveEnabled()) return console.log(dim("25Live is turned off (TWENTYFIVE_LIVE_MODE=off) — skipping."));
    const r = await importFrom25Live({ overwrite: opts.overwrite });
    console.log(`25Live ${dim(`(${r.mode})`)}: ${r.rooms} rooms · ${r.created.length} new · ${r.updated.length} updated · ${r.unchanged} unchanged`);
    if (r.updated.length) console.log(`  Updated: ${r.updated.join(", ")}`);
    if (r.keptLocal.length) {
      console.log(yellow(`  Kept your local edits to ${r.keptLocal.join(", ")} (rerun with --overwrite to take 25Live's version)`));
    }
    if (r.missing.length) console.log(yellow(`  No longer in 25Live (not deleted): ${r.missing.join(", ")}`));
    for (const e of r.errors) console.log(red(`  Could not import ${e}`));
  },

  async pull(_args, opts) {
    const r = await pullReservationsFromCalendar(readWindow(opts));
    console.log(
      `Google Calendar ${dim(`(${r.mode})`)}: ${r.rooms.rooms.length} room calendars · ${r.reservations} reservations ` +
        dim(`(${toDateString(r.window.from)} – ${toDateString(r.window.to)})`),
    );
    console.log(dim("  " + r.perRoom.map((p) => `${p.room} ${p.count}`).join(" · ")));
    if (r.declined) console.log(dim(`  Left out ${r.declined} bookings the room declined (struck through in Google Calendar)`));
    printRoomWarnings(r.rooms);
    const skipped = [...new Set(r.skipped.map((s) => s.title))];
    if (skipped.length) console.log(dim(`  Skipped ${r.skipped.length} all-day/multi-day events: ${skipped.slice(0, 5).join(", ")}${skipped.length > 5 ? ", …" : ""}`));
  },

  async refresh(args, opts) {
    await commands.pull(args, opts);
    await commands.import(args, opts);
  },

  async push() {
    const r = await pushAllToCalendar();
    console.log(
      `Google Calendar ${dim(`(${r.mode})`)}: ${r.created.length} created · ${r.updated.length} updated · ${r.moved.length} moved · ${r.unchanged} unchanged`,
    );
    if (r.created.length) console.log(`  Created: ${r.created.join(", ")}`);
    if (r.updated.length) console.log(`  Updated: ${r.updated.join(", ")}`);
    if (r.moved.length) console.log(`  Moved to another room's calendar: ${r.moved.join(", ")}`);
    if (r.removed.length) console.log(`  Removed (no room): ${r.removed.join(", ")}`);
    for (const x of r.skipped) console.log(dim(`  Skipped ${x}`));
    for (const f of r.failures) console.log(red(`  Failed: ${f}`));
  },

  async google([sub]) {
    if (sub === "login") {
      if (integrationMode("GOOGLE_CALENDAR_MODE") !== "live") {
        console.log(yellow("Note: GOOGLE_CALENDAR_MODE is not \"live\" yet, so other commands will keep using mock data.\n"));
      }
      const { scope } = await loginWithBrowser((line) => console.log(line));
      console.log(green(`Signed in (${scope.endsWith("readonly") ? "read-only" : "read + write"}). Token saved to ${tokenPath()}`));
      console.log(`Next: ${bold("npm run cli -- google calendars")}`);
      return;
    }
    if (sub === "calendars") {
      const r = await syncRoomsFromCalendars();
      console.log(heading("Room calendars"));
      console.log(
        table(
          ["Room", "Seats", "Calendar"],
          r.rooms.map((x) => [x.name, x.capacity === x.calendarCapacity ? String(x.capacity) : yellow(`${x.capacity} (calendar: ${x.calendarCapacity})`), dim(x.calendar)]),
        ),
      );
      console.log(heading("Other calendars (ignored)"));
      for (const name of r.otherCalendars) console.log(dim(`  ${name}`));
      printRoomWarnings(r);
      return;
    }
    throw new ServiceError('Use "google login" or "google calendars".');
  },

  async search(args) {
    const text = args.join(" ");
    if (!text.trim()) throw new ServiceError('Say what to look for, e.g. search SN014 or search "TR at 2pm 40+ seats".');
    const query = parseSearch(text);
    const [rooms, occupants, dates] = await Promise.all([prisma.room.findMany(), loadOccupants(), termDates()]);
    const range = { from: toDateString(new Date()), to: toDateString(dates.endDate) };
    const busy = (room: string) =>
      occupants
        .filter((o) => o.roomId === rooms.find((r) => r.name === room)?.id)
        .map((o) => ({ ...o, startDate: toDateString(o.startDate), endDate: toDateString(o.endDate) }));
    const results = rooms
      .filter((r) => matchesRoom(r, query))
      .map((room) => ({ room, a: roomAvailability(busy(room.name), query, range) }))
      .sort((x, y) => Number(y.a?.fits ?? true) - Number(x.a?.fits ?? true) || x.room.capacity - y.room.capacity);

    console.log(heading(describeQuery(query, query.date ? undefined : range.to)));
    console.log(
      table(
        ["Room", "Building", "Type", "Seats", ...(hasTimeQuery(query) ? ["Availability"] : [])],
        results.map(({ room, a }) => [
          room.name,
          buildingName(room.name) ?? "—",
          room.category ?? "—",
          String(room.capacity),
          ...(a
            ? [
                a.fits
                  ? green(query.startMinute !== null ? "free" : `free ${describeWindows(a.freeWindows.slice(0, 4))}${a.freeWindows.length > 4 ? ", …" : ""}`)
                  : red(a.blockers.length ? `busy: ${a.blockers.slice(0, 3).join(", ")}` : `no free ${query.duration ?? 30}-minute window`),
              ]
            : []),
        ]),
      ),
    );
    if (hasTimeQuery(query) && !query.date) console.log(dim(`\n  "Free" means free on every matching day from ${range.from} to ${range.to}.`));
  },

  async rooms() {
    const rooms = await prisma.room.findMany({ orderBy: [{ category: "asc" }, { name: "asc" }], include: { _count: { select: { meetings: true, reservations: true } } } });
    console.log(heading("Rooms"));
    console.log(
      table(
        ["Room", "Type", "Seats", "Calendar", "Courses", "Reservations"],
        rooms.map((r) => [
          r.name,
          r.category ?? dim("—"),
          String(r.capacity),
          r.googleCalendarId ? green("linked") : yellow("none"),
          String(r._count.meetings),
          String(r._count.reservations),
        ]),
      ),
    );
  },

  async calendar([sub], opts) {
    if (sub === "diff") {
      const d = await diffCalendar();
      console.log(heading(`Schedule vs Google Calendar (${d.mode})`));
      const color = { "in sync": green, missing: yellow, outdated: red, "wrong room": red, "no calendar": dim };
      console.log(
        table(
          ["Course", "Status", "Details"],
          d.meetings.map((m) => [
            m.label,
            color[m.status](m.status),
            m.differences.map((x) => `${x.field}: calendar "${x.actual}" → should be "${x.expected}"`).join("; "),
          ]),
        ),
      );
      if (d.orphaned.length) console.log(yellow(`\n  Events for meetings that no longer exist: ${d.orphaned.join(", ")}`));
      const pending = d.meetings.filter((m) => m.status !== "in sync" && m.status !== "no calendar").length;
      console.log(pending ? `\n${pending} to fix — run ${bold("npm run cli -- push")}` : green("\nCalendar is up to date."));
      return;
    }
    if (sub) throw new ServiceError(`Unknown calendar subcommand "${sub}". Use "calendar" or "calendar diff".`);

    const window = opts.from || opts.to ? readWindow(opts) : thisWeek();
    const { mode, perRoom } = await listCalendarEvents({ room: opts.room ? normalizeRoomName(opts.room) : undefined, window });
    const roomCalendarIds = new Map((await prisma.room.findMany()).map((r) => [r.name, r.googleCalendarId]));
    console.log(heading(`Room calendar events, ${toDateString(window.from)} – ${toDateString(window.to)} (${mode})`));
    const rows = perRoom.flatMap(({ room, events }) =>
      events.map((e) => [
        room,
        e.summary ?? "(untitled)",
        describeWhen(e),
        managedKey(e) ? "this app" : dim("other"),
        roomCalendarIds.get(room) && roomResponse(e, roomCalendarIds.get(room)!) === "declined" ? yellow("declined") : "",
      ]),
    );
    console.log(table(["Room", "Title", "When", "Created by", "Room response"], rows));
    if (mode === "mock") console.log(dim(`\n  Mock calendar state: ${mockCalendarPath()}`));
  },

  async schedule(_args, opts) {
    const { meetings, reservations, conflicts, capacityIssues } = await getSchedule();
    const flagged = new Set([...conflicts.flatMap((c) => [c.meetingId, c.otherMeetingId]), ...capacityIssues.map((c) => c.meetingId)]);
    const days = opts.day ?? opts.days;
    const dayFilter = days ? parseDayPattern(days) : null;
    const roomFilter = opts.room ? normalizeRoomName(opts.room) : null;
    const courseFilter = opts.course ? opts.course.replace(/\s+/g, "").toUpperCase() : null;
    const matchesTime = (x: { days: string[] }) => !dayFilter || x.days.some((d) => dayFilter.includes(d as never));
    const matchesRoom = (name: string | undefined) => !roomFilter || (name && normalizeRoomName(name) === roomFilter);

    const rows = meetings
      .filter((m) => matchesTime(m) && matchesRoom(m.room?.name))
      .filter((m) => !courseFilter || courseLabel(m.course).replace(/\s+/g, "").toUpperCase().startsWith(courseFilter))
      .map((m) => {
        const overCapacity = m.room && m.room.capacity < m.course.expectedEnrollment;
        return [
          (flagged.has(m.id) ? red : String)(courseLabel(m.course)),
          m.course.title,
          formatDays(m.days),
          formatTimeRange(m.startMinute, m.endMinute),
          m.room?.name ?? yellow("unassigned"),
          (overCapacity ? red : String)(`${m.course.expectedEnrollment} / ${m.room?.capacity ?? "—"}`),
          dim(m.source),
        ];
      });
    console.log(heading("Course meetings"));
    console.log(table(["Course", "Title", "Days", "Time", "Room", "Enrolled/Cap", "Source"], rows));

    if (!courseFilter) {
      // Calendar occurrences are stored one per date; group repeats of the same booking for display.
      const groups = new Map<string, { title: string; room: string; days: Set<string>; time: string; dates: Date[]; flagged: boolean }>();
      for (const r of reservations.filter((r) => matchesTime(r) && matchesRoom(r.room.name))) {
        const time = formatTimeRange(r.startMinute, r.endMinute);
        const key = `${r.room.name}|${r.title}|${time}`;
        const g = groups.get(key) ?? { title: r.title, room: r.room.name, days: new Set(), time, dates: [], flagged: false };
        r.days.forEach((d) => g.days.add(d));
        g.dates.push(r.startDate, r.endDate);
        g.flagged ||= flagged.has(r.id);
        groups.set(key, g);
      }
      console.log(heading("Room reservations (from Google Calendar)"));
      console.log(
        table(
          ["Room", "Title", "Days", "Time", "Dates"],
          [...groups.values()]
            .sort((a, b) => a.room.localeCompare(b.room) || a.time.localeCompare(b.time))
            .map((g) => {
              const first = new Date(Math.min(...g.dates.map(Number)));
              const last = new Date(Math.max(...g.dates.map(Number)));
              const days = WEEKDAYS.filter((d) => g.days.has(d));
              return [g.room, (g.flagged ? red : String)(g.title), formatDays(days), g.time, describeDates(first, last)];
            }),
        ),
      );
    }
    if (flagged.size) console.log(dim(`\n  Red = has a problem. Run ${bold("npm run cli -- problems")} for details.`));
  },

  async problems() {
    const { conflictGroups, capacityIssues, unassigned } = await getSchedule();
    const clashes = conflictGroups.filter((g) => !g.duplicate);
    const duplicates = conflictGroups.filter((g) => g.duplicate);
    const when = (g: (typeof conflictGroups)[number]) => {
      const days = formatDays(g.days);
      if (!g.dates.length) return `every ${days} ${g.time}`;
      const shown = g.dates.slice(0, 3).map((d) => toDateString(d).slice(5)).join(", ");
      return `${days} ${g.time} · ${g.dates.length === 1 ? toDateString(g.dates[0]) : `${g.dates.length} dates (${shown}${g.dates.length > 3 ? ", …" : ""})`}`;
    };

    console.log(heading(`Room conflicts (${clashes.length})`));
    for (const g of clashes) console.log(red(`  ✗ ${g.roomName}: ${g.label}  ↔  ${g.otherLabel}`) + dim(`  ${when(g)}`));
    if (!clashes.length) console.log(green("  none"));

    if (duplicates.length) {
      console.log(heading(`Booked twice (${duplicates.length})`));
      for (const g of duplicates) console.log(yellow(`  ⚠ ${g.roomName}: "${g.label}" has two overlapping bookings`) + dim(`  ${when(g)}`));
    }

    console.log(heading(`Rooms too small (${capacityIssues.length})`));
    for (const c of capacityIssues) console.log(red(`  ✗ ${c.label}: ${c.expectedEnrollment} students, ${c.roomName} seats ${c.capacity}`));
    if (!capacityIssues.length) console.log(green("  none"));

    console.log(heading(`No room assigned (${unassigned.length})`));
    for (const u of unassigned) console.log(yellow(`  • ${u.label}`));
    if (!unassigned.length) console.log(green("  none"));

    if (conflictGroups.length + capacityIssues.length + unassigned.length) {
      console.log(dim(`\n  Find a room: npm run cli -- availability --day TR --start 14:00 --end 15:15 --min-capacity 48`));
    }
  },

  async availability(_args, opts) {
    const startMinute = parseTime(required(opts.start, "--start"));
    const endMinute = parseTime(required(opts.end, "--end"));
    let window: { startDate: Date; endDate: Date };
    let days;
    if (opts.date) {
      const date = new Date(`${opts.date}T00:00:00Z`);
      if (Number.isNaN(date.getTime())) throw new ServiceError(`Can't read date "${opts.date}". Use YYYY-MM-DD.`);
      window = { startDate: date, endDate: date };
      days = [weekdayOf(date)];
    } else {
      window = await termDates();
      days = parseDayPattern(required(opts.day ?? opts.days, "--day (or --date)"));
    }
    const minCapacity = opts["min-capacity"] ? Number(opts["min-capacity"]) : undefined;
    const rows = await findAvailableRooms({ days, startMinute, endMinute, ...window, minCapacity });

    const when = opts.date ? `${opts.date} (${formatDays(days)})` : `every ${formatDays(days)}, ${describeDates(window.startDate, window.endDate)}`;
    console.log(heading(`Rooms for ${formatTimeRange(startMinute, endMinute)}, ${when}${minCapacity ? `, ${minCapacity}+ seats` : ""}`));
    console.log(
      table(
        ["Room", "Seats", "Status"],
        rows.map(({ room, busyWith }) => [room.name, String(room.capacity), busyWith.length ? red(`busy: ${busyWith.join(", ")}`) : green("free")]),
      ),
    );
  },

  async assign([courseArg], opts) {
    const meeting = await findMeeting(required(courseArg, "a course, e.g. \"COMP 523-001\""));
    const changes: AssignmentChanges = {};
    if (opts.room) changes.roomId = opts.room.toLowerCase() === "none" ? null : (await findRoom(opts.room)).id;
    if (opts.days ?? opts.day) changes.days = parseDayPattern((opts.days ?? opts.day)!);
    if (opts.start) changes.startMinute = parseTime(opts.start);
    if (opts.end) changes.endMinute = parseTime(opts.end);
    if (!Object.keys(changes).length) throw new ServiceError("Nothing to change. Pass --room, --days, --start and/or --end.");

    const dryRun = Boolean(opts["dry-run"]);
    let result: AssignmentResult;
    try {
      result = await assignMeeting(meeting.id, changes, { actor: `cli:${os.userInfo().username}`, dryRun, syncCalendar: !opts["no-sync"] });
    } catch (err) {
      if (err instanceof ServiceError && err.status === 409) {
        printAssignment(courseLabel(meeting.course), err.details as AssignmentResult);
        console.log(red(`\nNot saved: ${err.message}`));
        process.exitCode = 1;
        return;
      }
      throw err;
    }
    printAssignment(courseLabel(meeting.course), result);
    if (!result.changes.length) console.log(dim("\nAlready assigned that way — nothing to change."));
    else if (dryRun) console.log(dim("\nPreview only — run again without --dry-run to save."));
    else console.log(green("\nSaved."));
    if (result.calendarSync) console.log((result.calendarSync.ok ? dim : yellow)(`  ${result.calendarSync.message}`));
  },

  async history(_args, opts) {
    const logs = await prisma.changeLog.findMany({
      take: opts.limit ? Number(opts.limit) : 20,
      orderBy: { createdAt: "desc" },
      include: { meeting: { include: { course: true } } },
    });
    console.log(heading("Recent changes"));
    console.log(
      table(
        ["When", "Course", "Field", "From", "To", "By"],
        logs.map((l) => [l.createdAt.toLocaleString(), courseLabel(l.meeting.course), l.field, l.oldValue ?? "", l.newValue ?? "", dim(l.changedBy)]),
      ),
    );
  },

  async status() {
    const [rooms, courses, meetings, reservations, runs] = await Promise.all([
      prisma.room.count(),
      prisma.course.count(),
      prisma.meeting.count(),
      prisma.roomReservation.count(),
      prisma.syncRun.findMany({ orderBy: { startedAt: "desc" }, distinct: ["system"] }),
    ]);
    console.log(heading("Data sources"));
    const googleMode = integrationMode("GOOGLE_CALENDAR_MODE");
    const signedIn = fs.existsSync(tokenPath());
    console.log(`  25Live           ${integrationMode("TWENTYFIVE_LIVE_MODE")}`);
    console.log(
      `  Google Calendar  ${googleMode}` +
        (googleMode === "live" ? ` · ${signedIn ? green("signed in") : red("not signed in")} · writes ${calendarWritesEnabled() ? yellow("ON") : "off"}` : ""),
    );
    console.log(heading("Local database"));
    console.log(`  ${rooms} rooms · ${courses} courses · ${meetings} meetings · ${reservations} room reservations`);
    console.log(heading("Last sync"));
    for (const system of ["TWENTYFIVE_LIVE", "GOOGLE_CALENDAR"] as const) {
      const run = runs.find((r) => r.system === system);
      const name = system === "TWENTYFIVE_LIVE" ? "25Live         " : "Google Calendar";
      if (!run) console.log(`  ${name}  ${yellow("never")}`);
      else console.log(`  ${name}  ${(run.status === "SUCCESS" ? green : red)(run.status.toLowerCase())} ${run.startedAt.toLocaleString()} ${dim(run.message ?? "")}`);
    }
  },

  async reset(_args, opts) {
    if (!opts.yes) throw new ServiceError("This deletes all local data and the mock calendar. Rerun with --yes to confirm.");
    await resetAll();
    console.log(`Cleared. Run ${bold("npm run cli -- refresh")} to load the dummy data again.`);
  },
};

function readDate(value: string, flag: string): Date {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) throw new ServiceError(`Can't read ${flag} "${value}". Use YYYY-MM-DD.`);
  return date;
}

function readWindow(opts: Options): { from: Date; to: Date } {
  const defaults = defaultWindow();
  const from = opts.from ? readDate(opts.from, "--from") : defaults.from;
  const to = opts.to ? readDate(opts.to, "--to") : defaults.to;
  if (to <= from) throw new ServiceError("--to must be after --from.");
  return { from, to };
}

function thisWeek(): { from: Date; to: Date } {
  const { from } = defaultWindow();
  const to = new Date(from);
  to.setUTCDate(to.getUTCDate() + 7);
  return { from, to };
}

function printRoomWarnings(r: Awaited<ReturnType<typeof syncRoomsFromCalendars>>) {
  for (const m of r.capacityMismatches) {
    console.log(yellow(`  ⚠ ${m.name}: config/rooms.json says ${m.config} seats, calendar name says ${m.calendar} (using ${m.config})`));
  }
  if (r.withoutCalendar.length) console.log(yellow(`  ⚠ No calendar found for: ${r.withoutCalendar.join(", ")}`));
}

function required(value: string | undefined, name: string): string {
  if (!value) throw new ServiceError(`Missing ${name}.`);
  return value;
}

/** Accepts "COMP 523-001", "comp523-001", or "COMP523" when there's only one section. */
async function findMeeting(input: string) {
  const want = input.replace(/\s+/g, "").toUpperCase();
  const meetings = await prisma.meeting.findMany({ include: { course: true } });
  const exact = meetings.filter((m) => courseLabel(m.course).replace(/\s+/g, "").toUpperCase() === want);
  const matches = exact.length ? exact : meetings.filter((m) => m.course.code.replace(/\s+/g, "").toUpperCase() === want);
  if (matches.length === 1) return matches[0];
  if (!matches.length) throw new ServiceError(`No course matches "${input}". Run "npm run cli -- schedule" to see courses.`);
  throw new ServiceError(`"${input}" matches ${matches.map((m) => courseLabel(m.course)).join(", ")} — include the section.`);
}

async function findRoom(input: string) {
  const rooms = await prisma.room.findMany();
  const room = rooms.find((r) => normalizeRoomName(r.name) === normalizeRoomName(input));
  if (!room) throw new ServiceError(`No room "${input}". Rooms: ${rooms.map((r) => r.name).join(", ")}`);
  return room;
}

function printAssignment(label: string, result: AssignmentResult) {
  console.log(heading(label));
  for (const c of result.changes) console.log(`  ${c.field}: ${c.oldValue} → ${bold(c.newValue)}`);
  for (const c of result.conflicts) console.log(red(`  ✗ conflicts with ${c.with} on ${formatDays(c.days)}`));
  if (result.capacityIssue) {
    console.log(yellow(`  ⚠ room seats ${result.capacityIssue.capacity}, course expects ${result.capacityIssue.expectedEnrollment}`));
  }
  if (!result.conflicts.length && !result.capacityIssue && result.changes.length) console.log(green("  ✓ no conflicts, room is big enough"));
}

function describeDates(start: Date, end: Date): string {
  const a = toDateString(start);
  const b = toDateString(end);
  if (a === b) return a;
  return b.startsWith("2100") ? `from ${a}` : `${a} – ${b}`;
}

function describeWhen(event: Parameters<typeof eventToSlot>[0]): string {
  if (event.start?.date) return dim(`all day ${event.start.date}`);
  const slot = eventToSlot(event);
  if (!slot) return dim(event.start?.dateTime ?? "?");
  const repeats = slot.startDate.getTime() !== slot.endDate.getTime();
  return `${repeats ? "every " : ""}${formatDays(slot.days)} ${formatTimeRange(slot.startMinute, slot.endMinute)} ${dim(describeDates(slot.startDate, slot.endDate))}`;
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      room: { type: "string" },
      day: { type: "string" },
      days: { type: "string" },
      course: { type: "string" },
      start: { type: "string" },
      end: { type: "string" },
      date: { type: "string" },
      "min-capacity": { type: "string" },
      from: { type: "string" },
      to: { type: "string" },
      limit: { type: "string" },
      "dry-run": { type: "boolean" },
      "no-sync": { type: "boolean" },
      overwrite: { type: "boolean" },
      yes: { type: "boolean", short: "y" },
      help: { type: "boolean", short: "h" },
    },
  });
  const [command = "help", ...args] = positionals;
  if (values.help || command === "help") return console.log(HELP);
  const run = commands[command];
  if (!run) throw new ServiceError(`Unknown command "${command}". Run "npm run cli -- help".`);
  await run(args, values);
}

main()
  .catch((err) => {
    const expected = err instanceof ServiceError || (err as { code?: string }).code?.startsWith("ERR_PARSE_ARGS");
    console.error(red(expected ? `Error: ${err.message}` : (err.stack ?? String(err))));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
