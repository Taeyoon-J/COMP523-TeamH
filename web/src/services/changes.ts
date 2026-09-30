import { formatDays, formatTimeRange, type Weekday } from "@/lib/scheduling";

interface Assignment {
  roomId: string | null;
  roomName: string | null;
  days: Weekday[];
  startMinute: number;
  endMinute: number;
}

export interface FieldChange {
  field: "room" | "days" | "time";
  oldValue: string;
  newValue: string;
}

/** Human-readable differences between two assignments, as stored in ChangeLog. */
export function describeChanges(before: Assignment, after: Assignment): FieldChange[] {
  const changes: FieldChange[] = [];
  if (before.roomId !== after.roomId) {
    changes.push({ field: "room", oldValue: before.roomName ?? "none", newValue: after.roomName ?? "none" });
  }
  if (formatDays(before.days) !== formatDays(after.days)) {
    changes.push({ field: "days", oldValue: formatDays(before.days), newValue: formatDays(after.days) });
  }
  if (before.startMinute !== after.startMinute || before.endMinute !== after.endMinute) {
    changes.push({
      field: "time",
      oldValue: formatTimeRange(before.startMinute, before.endMinute),
      newValue: formatTimeRange(after.startMinute, after.endMinute),
    });
  }
  return changes;
}
