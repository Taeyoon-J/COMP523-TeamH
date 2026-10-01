import { auth, isAdmin, signIn, signOut } from "@/auth";
import type { CalendarItem } from "@/components/ScheduleCalendar";
import ScheduleExplorer from "@/components/ScheduleExplorer";
import { getSchedule } from "@/lib/schedule-data";
import { formatDays, formatMinute, formatTimeRange } from "@/lib/scheduling";

export const dynamic = "force-dynamic";

/** "Every week" searches check from today through the last date we have data for. */
function searchRange(items: CalendarItem[]): { from: string; to: string } {
  const from = new Date().toISOString().slice(0, 10);
  const lastExclusive = items.reduce((max, i) => (i.endRecur > max ? i.endRecur : max), from);
  const to = new Date(new Date(`${lastExclusive}T00:00:00Z`).getTime() - 86_400_000).toISOString().slice(0, 10);
  return { from, to: to < from ? from : to };
}

export default async function Home() {
  const [session, schedule] = await Promise.all([auth(), getSchedule()]);
  const { rooms, meetings, reservations, conflicts, conflictGroups, capacityIssues, lastSyncs } = schedule;

  const problemIds = new Set([...conflicts.flatMap((c) => [c.meetingId, c.otherMeetingId]), ...capacityIssues.map((c) => c.meetingId)]);
  const lastSynced = (system: string) => lastSyncs.find((s) => s.system === system)?.finishedAt?.toLocaleString() ?? "never";
  const endRecur = (d: Date) => new Date(d.getTime() + 86_400_000).toISOString().slice(0, 10); // exclusive
  const day = (d: Date) => d.toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric", year: "numeric" });
  const synced = (d: Date | null) => (d ? d.toLocaleString("en-US") : "never");

  // What each item overlaps with, for the detail dialog.
  const problemsById = new Map<string, Set<string>>();
  const addProblem = (id: string, text: string) => problemsById.set(id, (problemsById.get(id) ?? new Set()).add(text));
  for (const c of conflicts) {
    const twice = c.label === c.otherLabel;
    addProblem(c.meetingId, twice ? "Booked twice at this time" : `Overlaps ${c.otherLabel} in ${c.roomName}`);
    addProblem(c.otherMeetingId, twice ? "Booked twice at this time" : `Overlaps ${c.label} in ${c.roomName}`);
  }
  for (const c of capacityIssues) addProblem(c.meetingId, `${c.expectedEnrollment} students expected, ${c.roomName} seats ${c.capacity}`);
  const problems = (id: string) => [...(problemsById.get(id) ?? [])];

  const items: CalendarItem[] = [
    ...meetings.map((m) => ({
      id: m.id,
      label: `${m.course.code}-${m.course.section}`,
      roomName: m.room?.name ?? null,
      days: m.days,
      startMinute: m.startMinute,
      endMinute: m.endMinute,
      startRecur: m.startDate.toISOString().slice(0, 10),
      endRecur: endRecur(m.endDate),
      kind: "course" as const,
      hasProblem: problemIds.has(m.id),
      details: {
        title: `${m.course.code}-${m.course.section} ${m.course.title}`,
        kindLabel: "Course",
        rows: [
          { label: "When", value: `${formatDays(m.days)} ${formatTimeRange(m.startMinute, m.endMinute)}` },
          { label: "Dates", value: `${day(m.startDate)} – ${day(m.endDate)}` },
          { label: "Room", value: m.room ? `${m.room.name} (${m.room.capacity} seats)` : "No room assigned" },
          { label: "Enrollment", value: `${m.course.expectedEnrollment} expected` },
          { label: "Instructor", value: m.course.instructorName ?? "—" },
          { label: "Source", value: m.source === "LOCAL" ? "Edited here" : m.source === "TWENTYFIVE_LIVE" ? "25Live" : "Google Calendar" },
          { label: "Last synced", value: synced(m.lastSyncedAt) },
        ],
        problems: problems(m.id),
        description: null,
        link: null,
      },
    })),
    ...reservations.map((r) => {
      const oneDay = r.startDate.getTime() === r.endDate.getTime();
      return {
        id: r.id,
        label: r.title,
        roomName: r.room.name,
        days: r.days,
        startMinute: r.startMinute,
        endMinute: r.endMinute,
        startRecur: r.startDate.toISOString().slice(0, 10),
        endRecur: endRecur(r.endDate),
        kind: "reservation" as const,
        hasProblem: problemIds.has(r.id),
        details: {
          title: r.title,
          kindLabel: "Room booking",
          rows: [
            { label: "When", value: `${oneDay ? day(r.startDate) : `Every ${formatDays(r.days)}`} · ${formatTimeRange(r.startMinute, r.endMinute)}` },
            ...(oneDay ? [] : [{ label: "Dates", value: `${day(r.startDate)} – ${day(r.endDate)}` }]),
            { label: "Room", value: `${r.room.name} (${r.room.capacity} seats)` },
            { label: "Booked by", value: r.organizer ?? "—" },
            { label: "Source", value: "Google Calendar" },
            { label: "Last synced", value: synced(r.lastSyncedAt) },
          ],
          problems: problems(r.id),
          description: r.description,
          link: r.htmlLink,
        },
      };
    }),
  ];

  return (
    <main className="mx-auto w-full max-w-6xl space-y-8 px-4 py-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">UNC CS Classroom Scheduling</h1>
          <p className="text-sm text-zinc-500">
            Last synced — 25Live: {lastSynced("TWENTYFIVE_LIVE")} · Google Calendar: {lastSynced("GOOGLE_CALENDAR")}
          </p>
        </div>
        {session?.user ? (
          <form action={async () => { "use server"; await signOut(); }}>
            <span className="mr-3 text-sm">
              {session.user.email} {isAdmin(session.user.email) ? "(admin)" : "(view only)"}
            </span>
            <button className="rounded border px-3 py-1 text-sm">Sign out</button>
          </form>
        ) : (
          <form action={async () => { "use server"; await signIn("google"); }}>
            <button className="rounded bg-[#4b9cd3] px-3 py-1 text-sm text-white">Sign in with Google</button>
          </form>
        )}
      </header>

      {(conflicts.length > 0 || capacityIssues.length > 0) && (
        <section className="rounded border border-red-300 bg-red-50 p-4 text-sm text-red-900">
          <h2 className="mb-2 font-semibold">Problems</h2>
          <ul className="list-disc space-y-1 pl-5">
            {conflictGroups.map((g) => (
              <li key={`${g.roomName}-${g.label}-${g.otherLabel}-${g.time}`}>
                {g.duplicate ? `Booked twice in ${g.roomName}: ${g.label}` : `Room conflict in ${g.roomName}: ${g.label} and ${g.otherLabel}`} ·{" "}
                {g.days.join(", ")} {g.time}
                {g.dates.length > 0 && ` · ${g.dates.length === 1 ? g.dates[0].toISOString().slice(0, 10) : `${g.dates.length} dates`}`}
              </li>
            ))}
            {capacityIssues.map((c) => (
              <li key={c.meetingId}>
                {c.label} expects {c.expectedEnrollment} students but {c.roomName} seats {c.capacity}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <ScheduleExplorer
          rooms={rooms.map((r) => ({ name: r.name, capacity: r.capacity, category: r.category }))}
          items={items}
          range={searchRange(items)}
        />
      </section>

      {meetings.length > 0 && <section className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b text-zinc-500">
            <tr>
              <th className="py-2">Course</th>
              <th>Title</th>
              <th>Days</th>
              <th>Time</th>
              <th>Room</th>
              <th>Enrollment / Capacity</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            {meetings.map((m) => (
              <tr key={m.id} className={`border-b ${problemIds.has(m.id) ? "bg-red-50" : ""}`}>
                <td className="py-2 font-medium">{m.course.code}-{m.course.section}</td>
                <td>{m.course.title}</td>
                <td>{m.days.join(" ")}</td>
                <td>{formatMinute(m.startMinute)}–{formatMinute(m.endMinute)}</td>
                <td>{m.room?.name ?? "—"}</td>
                <td>{m.course.expectedEnrollment} / {m.room?.capacity ?? "—"}</td>
                <td>{m.source}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>}
    </main>
  );
}
