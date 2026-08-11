import { MemoryRecord } from "@/context/RecordsContext";

/**
 * Returns the current recording streak in days.
 *
 * A streak is the count of consecutive calendar days — ending today or
 * yesterday — that contain at least one record. If neither today nor yesterday
 * has a record the streak is 0.
 *
 * Uses the record's `date` field (YYYY-MM-DD), not `createdAt`, so that
 * records entered for a past date still count toward the correct day.
 */
export function computeStreak(records: MemoryRecord[]): number {
  if (records.length === 0) return 0;

  const dateset = new Set<string>(
    records.map((r) => r.date).filter(Boolean)
  );

  const fmt = (d: Date): string => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Start from today; fall back to yesterday if today has no entry yet
  const cursor = new Date(today);
  if (!dateset.has(fmt(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
    if (!dateset.has(fmt(cursor))) return 0;
  }

  let streak = 0;
  while (dateset.has(fmt(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}
