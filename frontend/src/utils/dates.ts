/** Date formatting utilities. ERPNext stores dates as `YYYY-MM-DD` (Datetime as `YYYY-MM-DD HH:MM:SS`). */

/**
 * This deployment's business timezone. ERPNext's date/datetime fields carry
 * no timezone marker — they're naive wall-clock values in the site's own
 * configured timezone (Asia/Karachi here). Every viewer, regardless of their
 * own device's timezone, should see the same values the server meant.
 */
export const APP_TIME_ZONE = "Asia/Karachi";

// Karachi has no DST — a fixed UTC+5 offset holds year-round.
const KARACHI_OFFSET_MS = 5 * 60 * 60 * 1000;

const ERP_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?\s*$/;

/**
 * Parse an ERPNext date (`YYYY-MM-DD`) or datetime (`YYYY-MM-DD HH:MM:SS`)
 * string as wall-clock time in `APP_TIME_ZONE` and return the matching
 * instant. Formatting the result back with `timeZone: APP_TIME_ZONE`
 * reproduces the original digits on any viewer's device, regardless of that
 * device's own timezone. Anything else (already-tagged ISO strings, etc.)
 * falls back to native parsing.
 */
export function parseDate(value?: string | null): Date | null {
  if (!value) return null;
  const m = ERP_DATE_RE.exec(value);
  if (m) {
    const [, y, mo, d, h = "0", mi = "0", s = "0"] = m;
    const utcMs =
      Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s)) - KARACHI_OFFSET_MS;
    return new Date(utcMs);
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDate(value?: string | null, opts?: Intl.DateTimeFormatOptions): string {
  const d = parseDate(value);
  if (!d) return "—";
  return d.toLocaleDateString("en-US", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "short",
    day: "numeric",
    ...opts,
  });
}

export function formatShortDate(value?: string | null): string {
  const d = parseDate(value);
  if (!d) return "—";
  return d.toLocaleDateString("en-US", { timeZone: APP_TIME_ZONE, month: "short", day: "numeric" });
}

export function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  const d = parseDate(value);
  if (!d) return value;
  return d.toLocaleString("en-US", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** ISO date string for ERPNext (YYYY-MM-DD). */
export function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Today's date, as ERPNext would see it — i.e. today in `APP_TIME_ZONE`, not the viewer's own local date. */
export function todayISO(): string {
  const karachiNow = new Date(Date.now() + KARACHI_OFFSET_MS);
  const y = karachiNow.getUTCFullYear();
  const m = String(karachiNow.getUTCMonth() + 1).padStart(2, "0");
  const d = String(karachiNow.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** First day of the current month in `APP_TIME_ZONE`, as an ERPNext-format ISO date. */
export function startOfMonthISO(): string {
  return `${todayISO().slice(0, 7)}-01`;
}

/** Last day of the current month in `APP_TIME_ZONE`, as an ERPNext-format ISO date. */
export function endOfMonthISO(): string {
  const [y, m] = todayISO().split("-").map(Number);
  // Day 0 of the *next* month is the last day of this one (UTC math — no local-timezone drift).
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
}

/** `iso` (YYYY-MM-DD) shifted by `days` calendar days (negative = earlier), as an ISO date. */
export function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`;
}

/**
 * The current instant as an ERPNext-format naive datetime string
 * (`YYYY-MM-DD HH:MM:SS`) in `APP_TIME_ZONE` — for writing timestamps
 * (e.g. a call log's start time) back to the server. `new Date().toISOString()`
 * would write the current UTC wall-clock time instead, which Frappe stores
 * verbatim and later displays as if it were already `APP_TIME_ZONE` time —
 * off by the zone's offset.
 */
export function nowERPDateTime(): string {
  const karachiNow = new Date(Date.now() + KARACHI_OFFSET_MS);
  const y = karachiNow.getUTCFullYear();
  const mo = String(karachiNow.getUTCMonth() + 1).padStart(2, "0");
  const d = String(karachiNow.getUTCDate()).padStart(2, "0");
  const h = String(karachiNow.getUTCHours()).padStart(2, "0");
  const mi = String(karachiNow.getUTCMinutes()).padStart(2, "0");
  const s = String(karachiNow.getUTCSeconds()).padStart(2, "0");
  return `${y}-${mo}-${d} ${h}:${mi}:${s}`;
}

/**
 * Month bucket key (`YYYY-MM`, sortable) and short label ("Jan") for a
 * date/datetime value, for grouping rows into monthly trend series.
 */
export function monthKeyAndLabel(value?: string | null): { key: string; label: string } | null {
  const d = parseDate(value);
  if (!d) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")?.value ?? "0000";
  const mo = parts.find((p) => p.type === "month")?.value ?? "01";
  const label = d.toLocaleDateString("en-US", { timeZone: APP_TIME_ZONE, month: "short" });
  return { key: `${y}-${mo}`, label };
}

/** Whole calendar days (in `APP_TIME_ZONE`) between an ERPNext date string and a UTC-midnight epoch. */
function calendarDaysBetween(value: string, todayUtcMs: number): number | null {
  const m = ERP_DATE_RE.exec(value);
  if (!m) return null;
  const target = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Math.round((target - todayUtcMs) / 86_400_000);
}

/** Human "x days ago" / "in x days", relative to today in `APP_TIME_ZONE`. */
export function relativeDays(value?: string | null): string {
  if (!value) return "";
  const todayMatch = ERP_DATE_RE.exec(todayISO())!;
  const todayUtcMs = Date.UTC(Number(todayMatch[1]), Number(todayMatch[2]) - 1, Number(todayMatch[3]));
  const diff = calendarDaysBetween(value, todayUtcMs);
  if (diff === null) return "";
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (diff > 0) return `in ${diff} days`;
  return `${Math.abs(diff)} days ago`;
}

/** Days remaining until a date (negative if past), relative to today in `APP_TIME_ZONE`. */
export function daysUntil(value?: string | null): number | null {
  if (!value) return null;
  const todayMatch = ERP_DATE_RE.exec(todayISO())!;
  const todayUtcMs = Date.UTC(Number(todayMatch[1]), Number(todayMatch[2]) - 1, Number(todayMatch[3]));
  return calendarDaysBetween(value, todayUtcMs);
}

/**
 * The earlier of a given ISO date and today — clamps a fiscal year's own end
 * date (which may fall in the future) so period-based reports don't request
 * data for months that haven't happened yet.
 */
export function clampToToday(date?: string | null): string | undefined {
  if (!date) return undefined;
  const today = todayISO();
  return date < today ? date : today;
}

/**
 * Fiscal year (1 July – 30 June) containing `iso` (defaults to today), as ISO dates —
 * e.g. 2026-09-28 → { from: "2026-07-01", to: "2027-06-30" }.
 */
export function fiscalYearRange(iso: string = todayISO()): { from: string; to: string } {
  const [y, m] = iso.split("-").map(Number);
  const start = m >= 7 ? y : y - 1;
  return { from: `${start}-07-01`, to: `${start + 1}-06-30` };
}
