/** Display formatters for the admin dashboard (money, counts, durations). */

/** KWD is 3-decimal (fils). Accepts number | numeric-string | null. */
export function formatKwd(value: number | string | null | undefined): string {
  const n = value == null ? 0 : typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return "0.000";
  return n.toLocaleString("en-US", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}

/** Compact integer with thousands separators. */
export function formatNum(value: number | string | null | undefined): string {
  const n = value == null ? 0 : typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return "0";
  return Math.round(n).toLocaleString("en-US");
}

/** Seconds → "2h 15m" / "45m" / "30s". Null-safe. */
export function formatDuration(seconds: number | string | null | undefined): string {
  const s = seconds == null ? 0 : typeof seconds === "string" ? Number(seconds) : seconds;
  if (!Number.isFinite(s) || s <= 0) return "—";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  if (m > 0) return `${m}m`;
  return `${Math.round(s)}s`;
}

/** Turn snake_case / enum text into a readable Title Case label. */
export function titleCase(value: string | null | undefined): string {
  if (!value) return "—";
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
