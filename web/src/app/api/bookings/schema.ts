import { z } from "zod";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const Weekday = z.enum(["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]);

export const BookingBody = z.object({
  roomId: z.string().min(1),
  title: z.string().min(1).max(200),
  description: z.string().max(4000).nullable().optional(),
  startDate: date,
  endDate: date.nullable().optional(),
  days: z.array(Weekday).optional(),
  startMinute: z.number().int().min(0).max(1439),
  endMinute: z.number().int().min(1).max(1440),
  /** Only check for conflicts. */
  dryRun: z.boolean().optional(),
});
