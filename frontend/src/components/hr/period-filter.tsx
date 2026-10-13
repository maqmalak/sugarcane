import { useMemo, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { useDocList } from "@/hooks/useDoc";
import { addDaysISO, formatDate, todayISO } from "@/utils/dates";
import { cn } from "@/utils/cn";

export type PeriodMode = "day" | "month" | "range";

const monthOf = (iso: string) => iso.slice(0, 7);
const lastDay = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return `${ym}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
};
const shiftMonth = (ym: string, by: number) => {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + by, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

/** Day / month / custom-range period, as inclusive ISO `from`–`to` bounds plus a label. */
export function usePeriod(initial: PeriodMode = "month") {
  const today = todayISO();
  const [mode, setMode] = useState<PeriodMode>(initial);
  const [day, setDay] = useState(today);
  const [month, setMonth] = useState(monthOf(today));
  const [from, setFrom] = useState(addDaysISO(today, -29));
  const [to, setTo] = useState(today);

  return useMemo(() => {
    const range =
      mode === "day" ? { from: day, to: day } : mode === "month" ? { from: `${month}-01`, to: lastDay(month) } : { from: from <= to ? from : to, to: from <= to ? to : from };
    const label =
      mode === "day"
        ? formatDate(day, { weekday: "short", day: "numeric", month: "short", year: "numeric" })
        : mode === "month"
          ? formatDate(`${month}-01`, { month: "long", year: "numeric", day: undefined })
          : `${formatDate(range.from)} – ${formatDate(range.to)}`;
    const days = Math.round((new Date(range.to).getTime() - new Date(range.from).getTime()) / 86400000) + 1;
    return {
      mode,
      setMode,
      day,
      setDay,
      month,
      setMonth,
      setFrom,
      setTo,
      /** Resolved, inclusive bounds of the period (for "range", the custom dates in order). */
      ...range,
      label,
      days,
      includesToday: range.from <= today && today <= range.to,
      /** Step one day / month back (-1) or forward (+1). */
      shift: (by: number) => (mode === "day" ? setDay(addDaysISO(day, by)) : setMonth(shiftMonth(month, by))),
      /** Jump to the period containing today. */
      current: () => (mode === "day" ? setDay(today) : setMonth(monthOf(today))),
      setRange: (f: string, t: string) => {
        setFrom(f);
        setTo(t);
        setMode("range");
      },
    };
  }, [mode, day, month, from, to, today]);
}

export type Period = ReturnType<typeof usePeriod>;

const MODES: { value: PeriodMode; label: string }[] = [
  { value: "day", label: "Day" },
  { value: "month", label: "Month" },
  { value: "range", label: "Range" },
];

/** Segmented Day / Month / Range switch with ‹ › stepping and the matching date picker. */
export function PeriodControl({ period }: { period: Period }) {
  const today = todayISO();
  const stepBtn = "flex h-9 w-9 items-center justify-center rounded-md border border-input hover:bg-accent";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex rounded-lg border border-input bg-muted/40 p-0.5">
        {MODES.map((m) => (
          <button
            key={m.value}
            type="button"
            onClick={() => period.setMode(m.value)}
            className={cn(
              "h-8 rounded-md px-3 text-xs font-medium transition-colors",
              period.mode === m.value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {m.label}
          </button>
        ))}
      </div>

      {period.mode !== "range" ? (
        <div className="flex items-center gap-1">
          <button type="button" className={stepBtn} onClick={() => period.shift(-1)} aria-label="Previous">
            <ChevronLeft className="h-4 w-4" />
          </button>
          {period.mode === "day" ? (
            <Input type="date" value={period.day} onChange={(e) => e.target.value && period.setDay(e.target.value)} className="w-40" aria-label="Day" />
          ) : (
            <Input type="month" value={period.month} onChange={(e) => e.target.value && period.setMonth(e.target.value)} className="w-40" aria-label="Month" />
          )}
          <button type="button" className={stepBtn} onClick={() => period.shift(1)} aria-label="Next">
            <ChevronRight className="h-4 w-4" />
          </button>
          {!period.includesToday && (
            <button type="button" onClick={period.current} className="ml-1 h-9 whitespace-nowrap rounded-md px-2.5 text-xs font-medium text-primary hover:bg-primary/10">
              {period.mode === "day" ? "Today" : "This month"}
            </button>
          )}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-1.5">
          <Input type="date" value={period.from} max={period.to} onChange={(e) => e.target.value && period.setFrom(e.target.value)} className="w-40" aria-label="From" />
          <span className="text-xs text-muted-foreground">to</span>
          <Input type="date" value={period.to} min={period.from} onChange={(e) => e.target.value && period.setTo(e.target.value)} className="w-40" aria-label="To" />
          {[
            { l: "7 d", d: 6 },
            { l: "30 d", d: 29 },
            { l: "90 d", d: 89 },
          ].map((p) => (
            <button key={p.l} type="button" onClick={() => period.setRange(addDaysISO(today, -p.d), today)} className="h-9 rounded-md px-2 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground">
              {p.l}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Department / branch filter values shared by the HR period pages. */
export function useHrDimensions() {
  const [department, setDepartment] = useState("");
  const [branch, setBranch] = useState("");
  const [search, setSearch] = useState("");
  return { department, setDepartment, branch, setBranch, search, setSearch };
}
export type HrDimensions = ReturnType<typeof useHrDimensions>;

export function NameSelect({ doctype, value, onChange, placeholder, filters }: { doctype: string; value: string; onChange: (v: string) => void; placeholder: string; filters?: unknown[][] }) {
  const { data } = useDocList(doctype, { fields: ["name"], filters, limit: 1000, orderBy: { field: "name", order: "asc" } });
  // Select renders its own full-width wrapper, so the width lives on this div.
  return (
    <div className="w-full sm:w-44">
    <Select value={value} onChange={(e) => onChange(e.target.value)} aria-label={placeholder}>
      <option value="">{placeholder}</option>
      {(data ?? []).map((d) => (
        <option key={d.name} value={d.name}>
          {String(d.name).replace(/ - [A-Z0-9]{2,6}$/, "")}
        </option>
      ))}
    </Select>
    </div>
  );
}

/** The filter card at the top of the Attendance / Leave pages: period, department, branch, employee search, plus page-specific extras. */
export function HrFilterBar({ period, dims, company, children }: { period: Period; dims: HrDimensions; company?: string; children?: ReactNode }) {
  const active = Boolean(dims.department || dims.branch || dims.search);
  return (
    <Card className="flex flex-col gap-3 p-3 xl:flex-row xl:items-center xl:justify-between">
      <PeriodControl period={period} />
      <div className="flex flex-wrap items-center gap-2">
        <NameSelect doctype="Department" value={dims.department} onChange={dims.setDepartment} placeholder="All departments" filters={company ? [["company", "=", company]] : undefined} />
        <NameSelect doctype="Branch" value={dims.branch} onChange={dims.setBranch} placeholder="All branches" />
        {children}
        <div className="relative w-full sm:w-52">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={dims.search} onChange={(e) => dims.setSearch(e.target.value)} placeholder="Employee name or ID…" className="pl-8" />
        </div>
        {active && (
          <button
            type="button"
            onClick={() => {
              dims.setDepartment("");
              dims.setBranch("");
              dims.setSearch("");
            }}
            className="inline-flex h-9 items-center gap-1 rounded-md px-2 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" /> Clear
          </button>
        )}
      </div>
    </Card>
  );
}
