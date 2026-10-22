// Interview time is decided by the server (design §1.2): the browser shows
// the number it is given and never computes the deadline itself.
import type { InterviewConfig } from "../contract/index.ts";

// Duration plus any accommodation the company granted (e.g. +25% time).
export function allowedSeconds(config: InterviewConfig): number {
  return Math.round(
    config.duration_minutes * 60 * (1 + config.accommodations.extra_time_percent / 100)
  );
}

export function remainingSeconds(
  row: { started_at: Date | null; config: InterviewConfig },
  now: Date
): number | null {
  if (!row.started_at) return null;
  const deadline = row.started_at.getTime() + allowedSeconds(row.config) * 1000;
  return Math.max(0, Math.floor((deadline - now.getTime()) / 1000));
}
