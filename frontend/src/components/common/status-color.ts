/**
 * Per-status colour system for CRM pipeline stages.
 *
 * Every known stage maps to its own distinct, elegant hue (a soft translucent
 * badge background + coloured text, plus a solid dot for table cells / kanban
 * column headers). Unknown statuses fall back to a deterministic hash so they
 * still render with a stable, pleasant colour instead of one flat grey.
 */

interface StatusTone {
  /** Pill badge: translucent background + coloured text. */
  badge: string;
  /** Solid dot for kanban column headers and other coloured markers. */
  dot: string;
}

const TONES: Record<string, StatusTone> = {
  sky: { badge: "bg-sky-500/10 text-sky-600 dark:text-sky-400", dot: "bg-sky-500" },
  indigo: { badge: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400", dot: "bg-indigo-500" },
  amber: { badge: "bg-amber-500/10 text-amber-600 dark:text-amber-400", dot: "bg-amber-500" },
  emerald: { badge: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400", dot: "bg-emerald-500" },
  rose: { badge: "bg-rose-500/10 text-rose-600 dark:text-rose-400", dot: "bg-rose-500" },
  teal: { badge: "bg-teal-500/10 text-teal-600 dark:text-teal-400", dot: "bg-teal-500" },
  slate: { badge: "bg-slate-500/10 text-slate-600 dark:text-slate-400", dot: "bg-slate-500" },
  blue: { badge: "bg-blue-500/10 text-blue-600 dark:text-blue-400", dot: "bg-blue-500" },
  violet: { badge: "bg-violet-500/10 text-violet-600 dark:text-violet-400", dot: "bg-violet-500" },
  orange: { badge: "bg-orange-500/10 text-orange-600 dark:text-orange-400", dot: "bg-orange-500" },
  cyan: { badge: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400", dot: "bg-cyan-500" },
  primary: { badge: "bg-primary/10 text-primary", dot: "bg-primary" },
};

/** Exact, deliberate stage → hue assignments. */
const STATUS_TONE: Record<string, string> = {
  // Lead pipeline
  new: "sky",
  contacted: "indigo",
  nurture: "amber",
  qualified: "emerald",
  converted: "emerald",
  // Deal pipeline
  qualification: "slate",
  analysis: "teal",
  proposal: "indigo",
  negotiation: "amber",
  won: "emerald",
  lost: "rose",
  // Generic happy / sad terminals & states
  closed: "emerald",
  completed: "emerald",
  delivered: "emerald",
  rejected: "rose",
  cancelled: "rose",
  open: "sky",
  pending: "amber",
  // Attendance & leave
  present: "emerald",
  absent: "rose",
  "on leave": "amber",
  "half day": "teal",
  "work from home": "indigo",
  approved: "emerald",
  "in progress": "teal",
  // Real estate: plots, bookings, bills, invoices, approvals
  available: "emerald",
  hold: "amber",
  reserved: "violet",
  booked: "blue",
  sold: "indigo",
  "possession given": "teal",
  blocked: "slate",
  active: "blue",
  transferred: "violet",
  "re-allotted": "cyan",
  merged: "cyan",
  paid: "emerald",
  "partly paid": "amber",
  unpaid: "orange",
  overdue: "rose",
  due: "amber",
  draft: "slate",
  submitted: "blue",
  "pending approval": "amber",
  "return": "violet",
  "credit note issued": "violet",
  working: "teal",
  "pending review": "amber",
  resolved: "emerald",
  scheduled: "sky",
  "no show": "rose",
  disabled: "slate",
  enabled: "emerald",
};

const FALLBACK_ORDER = ["sky", "indigo", "amber", "emerald", "rose", "teal", "violet", "cyan"];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) & 0x7fffffff;
  return h;
}

export function statusTone(status?: string): StatusTone {
  const s = (status ?? "").trim().toLowerCase();
  if (!s) return TONES.primary;
  // Exact match first; otherwise fall back to the first stage whose name is a
  // substring of this status (e.g. "Proposal/Quotation" -> "proposal"). The
  // result of either is always a *tone name* (a TONES key), never a raw status
  // key — STATUS_TONE values are the color keywords TONES is keyed by.
  // longest contained key wins ("Unpaid and Discounted" -> "unpaid", not "paid")
  const matched = Object.keys(STATUS_TONE)
    .filter((k) => s.includes(k))
    .sort((a, b) => b.length - a.length)[0];
  const tone = STATUS_TONE[s] ?? (matched ? STATUS_TONE[matched] : undefined);
  if (!tone) return TONES[FALLBACK_ORDER[hash(s) % FALLBACK_ORDER.length]];
  return TONES[tone];
}

/** The tone name (sky, emerald, …) for a status — handy for gradients and accent rings. */
export function statusHue(status?: string): string {
  const t = statusTone(status);
  return Object.keys(TONES).find((k) => TONES[k] === t) ?? "primary";
}

/** Pill badge classes for <StatusBadge/>. */
export function statusBadgeClass(status?: string): string {
  return statusTone(status).badge;
}

/** Solid dot colour for kanban column headers / inline markers. */
export function statusDotClass(status?: string): string {
  return statusTone(status).dot;
}