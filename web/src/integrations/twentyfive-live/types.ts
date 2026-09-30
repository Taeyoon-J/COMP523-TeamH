
// Shapes are our best guess at 25Live's space/reservation data; adjust once we have real API access.

export interface TwentyFiveLiveSpace {
  space_id: number;
  space_name: string;
  formal_name?: string;
  building_name?: string;
  max_capacity: number;
}

export interface TwentyFiveLiveReservation {
  reservation_id: string;
  event_name: string;
  term_code: string;
  subject: string;
  catalog_number: string;
  section: string;
  title: string;
  instructor?: string;
  expected_head_count: number;
  space_id: number | null;
  meeting_pattern: { days: string; start_time: string; end_time: string };
  start_date: string;
  end_date: string;
}

export interface TwentyFiveLiveClient {
  mode: "mock" | "live";
  listSpaces(): Promise<TwentyFiveLiveSpace[]>;
  listReservations(termCode?: string): Promise<TwentyFiveLiveReservation[]>;
}
