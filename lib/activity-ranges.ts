export const CLEAR_RANGES = ["7d", "30d", "90d", "all"] as const;

export type ClearRange = (typeof CLEAR_RANGES)[number];

export const CLEAR_RANGE_LABELS: Record<ClearRange, string> = {
  "7d": "Older than 7 days",
  "30d": "Older than 30 days",
  "90d": "Older than 90 days",
  all: "Everything",
};

const DAYS: Record<Exclude<ClearRange, "all">, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

export function isClearRange(value: unknown): value is ClearRange {
  return (
    typeof value === "string" &&
    (CLEAR_RANGES as readonly string[]).includes(value)
  );
}

export function clearCutoff(range: ClearRange): Date | null {
  if (range === "all") return null;

  return new Date(Date.now() - DAYS[range] * 24 * 60 * 60 * 1000);
}
