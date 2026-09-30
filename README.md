# COMP 523 Team H — Calendar Integration & Classroom Scheduling

A web app for the UNC Computer Science department to view course/classroom schedules in one place,
catch room conflicts and capacity problems, and keep the department Google Calendar in sync with
classroom assignments. Requirements: [docs/D1-specifications.md](docs/D1-specifications.md).

## Stack

| Layer | Choice |
| --- | --- |
| App | [Next.js](https://nextjs.org) 16 (App Router, TypeScript), Tailwind CSS |
| Database | PostgreSQL 16 (Docker) via [Prisma](https://www.prisma.io) |
| Auth | [Auth.js](https://authjs.dev) with Google sign-in; admin allowlist in `ADMIN_EMAILS` |
| Calendar | Google Calendar API (`googleapis`), signed in as you (OAuth) |
| Schedule UI | [FullCalendar](https://fullcalendar.io) v7 |
| Tests | Vitest |

## Getting started

Prerequisites: Node 20+ and Docker Desktop.

```bash
cd web
cp .env.example .env         # then fill in values (see below)
openssl rand -base64 32      # paste the output into AUTH_SECRET in .env
npm install
npm run db:up                # start Postgres in Docker
npm run db:migrate           # apply migrations
npm run db:seed              # load the dummy 25Live + Google Calendar data
npm run dev                  # http://localhost:3000
```

Other scripts: `npm test`, `npm run lint`, `npm run db:studio` (browse the DB).

## CLI

Everything the app does is also available from the terminal, which is the quickest way to try it
without Google credentials. Run from `web/`:

```bash
npm run cli -- help
npm run cli -- refresh                 # rooms + bookings from Google Calendar, courses from 25Live
npm run cli -- rooms                   # rooms, seats, linked calendars
npm run cli -- problems                # conflicts, rooms too small, courses with no room
npm run cli -- schedule --day TR       # also --room "SN 011", --course COMP523
npm run cli -- availability --day TR --start 14:00 --end 15:15 --min-capacity 45
npm run cli -- availability --date 2026-10-05 --start 9:00 --end 9:55
npm run cli -- assign "COMP 421-001" --room "FB 008" --dry-run   # preview; drop --dry-run to save
npm run cli -- calendar --room SN014    # events on a room calendar this week
npm run cli -- calendar diff           # where the room calendars disagree with the course schedule
npm run cli -- push                    # write course meetings to their room calendars
npm run cli -- history
npm run cli -- status
npm run cli -- reset --yes             # start over
```

### Dummy data (mock mode)

By default both integrations use fake data in [`web/fixtures/`](web/fixtures/), shaped like the real
thing. Edit those JSON files to try other scenarios.

- **Google Calendar** ([`fixtures/google-calendar/`](web/fixtures/google-calendar/)): like the department's
  setup, one calendar per room, named `FB009 seats 80` etc., plus a few non-room calendars. Writes from
  `push`/`assign` go to `web/.mock-data/google-calendar.json` (gitignored); `reset --yes` deletes it.
- **25Live** ([`fixtures/25live/`](web/fixtures/25live/)): 10 course sections in the classrooms. Read-only.

Scenarios built into the data:

| What | Where it shows up |
| --- | --- |
| COMP 301 and COMP 550 both in SN011 on Wednesday afternoon | `problems` (room conflict) |
| Two meetings double-booked in FB220 on Fri 10/2 | `problems` (conflict between calendar bookings) |
| A one-time colloquium in SN014 on Mon 10/5 during COMP 110 | `problems` (course vs. calendar booking) |
| COMP 421 has 48 students in FB008 (21 seats) | `problems` (too small) |
| COMP 560 has no room in 25Live | `problems` (unassigned) |
| COMP 210's event sits on SN014's calendar, but 25Live says FB009 | `calendar diff` → `push` moves it |
| SN011/SN014/SN115 calendar names disagree with `config/rooms.json` on seats | warning on `pull` |

### Rooms

Rooms come from the room calendars: any calendar named like `FB009 seats 80 (...)` becomes room FB009.
Seat counts in [`web/config/rooms.json`](web/config/rooms.json) win over the calendar name (`pull` warns
when they differ); that file also sets Classroom vs Conference Room. Room names are stored without
spaces (`SN011`), and lookups ignore spaces, hyphens and case.

### How the sources interact

- **Google Calendar room calendars** give us the rooms and everything booked in them. `pull` stores every
  event occurrence in the window (default: this week + 16 weeks; `--from/--to` to change) as a room
  reservation, which counts for conflicts and availability.
- **25Live gives us courses** (enrollment, instructor, official room). A meeting an admin changed here
  (`assign`) becomes `LOCAL`, and `import` leaves it alone unless you pass `--overwrite`.
- **`push`** writes each course meeting as a weekly event on its room's calendar, tagged with a private
  `managedBy` property so `pull` doesn't count it twice. It moves the event if the room changed.

## Connecting Google Calendar

This reads the real room calendars as *you*, with read-only access. Nothing is written unless you
explicitly turn writes on.

1. **Create an OAuth client** (once per team) in [Google Cloud Console](https://console.cloud.google.com/):
   - Create a project → *APIs & Services* → *Library* → enable **Google Calendar API**.
   - *OAuth consent screen*: User type **External** (or Internal if UNC allows), app name anything,
     add yourselves under **Test users**.
   - *Credentials* → *Create credentials* → *OAuth client ID* → Application type **Desktop app**.
2. **Configure `web/.env`**:
   ```
   GOOGLE_CALENDAR_MODE="live"
   TWENTYFIVE_LIVE_MODE="off"
   GOOGLE_OAUTH_CLIENT_ID="...apps.googleusercontent.com"
   GOOGLE_OAUTH_CLIENT_SECRET="..."
   ```
3. **Sign in and load the data** (from `web/`):
   ```bash
   npm run cli -- google login        # opens the browser; token saved to web/.secrets/ (gitignored)
   npm run cli -- google calendars    # check which calendars were recognized as rooms
   npm run cli -- reset --yes && npm run cli -- pull
   npm run cli -- problems
   ```

Notes:
- The room calendars must be in your Google Calendar list ("Other calendars"); only those are visible.
- If Google says the app is blocked, UNC's Workspace admin may restrict third-party apps. Try an
  "Internal" consent screen from a UNC-owned Cloud project, or ask the client/ITS.
- **Writes stay off for the real calendars.** `push`/`assign` refuse to touch Google unless
  `GOOGLE_CALENDAR_WRITE=true`, which also needs a new `google login`. Only turn it on with test calendars.

## Project layout

```
web/
  prisma/schema.prisma        data model: Room, Course, Meeting, ChangeLog, SyncRun
  prisma/seed.ts              reset + load dummy data
  fixtures/                   dummy 25Live + Google Calendar data
  config/rooms.json           room list: seats and type (authoritative)
  src/integrations/           25Live and Google Calendar clients (mock + live, Google OAuth login)
  src/services/               business logic shared by the CLI and the web API
    twentyfive-live-import.ts   25Live -> DB
    google-calendar-sync.ts     room calendars <-> DB (pull rooms + bookings / push / diff)
    assignments.ts              change a room/time with conflict + capacity checks
    availability.ts             free rooms for a time slot
  src/lib/scheduling.ts       conflict detection, capacity checks, day/time parsing (pure, unit-tested)
  src/lib/calendar-events.ts  meeting <-> Google Calendar event mapping (pure, unit-tested)
  src/lib/rooms.ts            room calendar name parsing + config/rooms.json
  src/cli/                    `npm run cli`
  src/auth.ts                 Auth.js config + admin check
  src/app/page.tsx            main schedule view
  src/app/api/
    schedule/                 GET    schedule, conflicts, capacity issues
    meetings/[id]/            PATCH  change room/time (admin); { dryRun: true } previews conflicts
    sync/25live/              POST   import from 25Live (admin)
    sync/google/              POST   { direction: "push" | "pull" } (admin)
```

## Requirement coverage (starting point)

| Requirement | Where |
| --- | --- |
| FR-1, FR-3, I-2 | `page.tsx`, `ScheduleCalendar.tsx`, `GET /api/schedule`, `cli schedule` |
| FR-2 | `services/availability.ts`, `cli availability` (no web UI yet) |
| FR-4, FR-8 | `services/assignments.ts`, `PATCH /api/meetings/[id]`, `cli assign` (no web editing UI yet) |
| FR-5, FR-6, I-7 | `lib/scheduling.ts`, red in the UI, `cli problems` |
| FR-7, FR-9 | `services/google-calendar-sync.ts`, `cli push / pull / calendar diff` |
| FR-10 | `services/twentyfive-live-import.ts` against mock data, `cli import` |
| FR-12 | `cli schedule --room/--day/--course` |
| FR-11 | `dryRun` option on the PATCH endpoint (drag-and-drop UI still to build) |
| FR-13, NFR-9 | `ChangeLog` table, written on every change |
| I-8 | "last synced" line in the header, from `SyncRun` |
| NFR-4 | `Meeting.source` (LOCAL / TWENTYFIVE_LIVE / GOOGLE_CALENDAR) |
| NFR-6, I-5 | `auth.ts` + `ADMIN_EMAILS` |

**Not started yet:** web UI for availability, editing, and filtering (FR-2, I-6, FR-12); the real 25Live
client; writing changes back to 25Live.

## Workflow

- Branch off `main` (`feature/<short-name>`), open a PR, get one review before merging.
- CI runs typecheck, lint, and tests on every PR.
- Schema changes: edit `schema.prisma`, run `npm run db:migrate -- --name <what-changed>`, commit the migration.
