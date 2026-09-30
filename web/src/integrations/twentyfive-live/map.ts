import { parseDayPattern, parseTime, type Weekday } from "@/lib/scheduling";
import type { TwentyFiveLiveReservation, TwentyFiveLiveSpace } from "./types";

export interface ImportedRoom {
  name: string;
  building: string | null;
  capacity: number;
}

export interface ImportedMeeting {
  externalId: string;
  term: string;
  code: string;
  section: string;
  title: string;
  instructorName: string | null;
  expectedEnrollment: number;
  spaceId: number | null;
  days: Weekday[];
  startMinute: number;
  endMinute: number;
  startDate: Date;
  endDate: Date;
}

export function mapSpace(space: TwentyFiveLiveSpace): ImportedRoom {
  return { name: space.space_name, building: space.building_name ?? null, capacity: space.max_capacity };
}

/** Throws if the reservation's meeting pattern can't be read. */
export function mapReservation(r: TwentyFiveLiveReservation): ImportedMeeting {
  return {
    externalId: r.reservation_id,
    term: r.term_code,
    code: `${r.subject} ${r.catalog_number}`,
    section: r.section,
    title: r.title,
    instructorName: r.instructor ?? null,
    expectedEnrollment: r.expected_head_count,
    spaceId: r.space_id,
    days: parseDayPattern(r.meeting_pattern.days),
    startMinute: parseTime(r.meeting_pattern.start_time),
    endMinute: parseTime(r.meeting_pattern.end_time),
    startDate: new Date(`${r.start_date}T00:00:00Z`),
    endDate: new Date(`${r.end_date}T00:00:00Z`),
  };
}
