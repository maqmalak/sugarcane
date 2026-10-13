import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { addDaysISO, endOfMonthISO, startOfMonthISO, todayISO } from "@/utils/dates";

export type DatePreset = "all" | "today" | "yesterday" | "last7" | "next7" | "month" | "custom";

export const DATE_PRESETS: { value: DatePreset; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "last7", label: "Last 7 days" },
  { value: "next7", label: "Next 7 days" },
  { value: "month", label: "This month" },
  { value: "custom", label: "Custom range" },
];

/** Inclusive [from, to] ISO-date bounds for a preset ("" = unbounded on that side). */
function presetRange(preset: DatePreset, customFrom: string, customTo: string): [string, string] {
  const today = todayISO();
  switch (preset) {
    case "today":
      return [today, today];
    case "yesterday": {
      const y = addDaysISO(today, -1);
      return [y, y];
    }
    case "last7":
      return [addDaysISO(today, -6), today];
    case "next7":
      return [today, addDaysISO(today, 6)];
    case "month":
      return [startOfMonthISO(), endOfMonthISO()];
    case "custom":
      return [customFrom, customTo];
    default:
      return ["", ""];
  }
}

/** State + helpers for a "filter by date" control. Pair it with <DateRangeFilterControls/>. */
export function useDateRangeFilter() {
  const [preset, setPreset] = useState<DatePreset>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  return useMemo(() => {
    const [rangeFrom, rangeTo] = presetRange(preset, from, to);
    // A custom range with neither end filled in filters nothing.
    const active = preset !== "all" && (!!rangeFrom || !!rangeTo);

    const display = !active
      ? ""
      : preset !== "custom"
        ? (DATE_PRESETS.find((p) => p.value === preset)?.label ?? "")
        : rangeFrom && rangeTo
          ? `${rangeFrom} → ${rangeTo}`
          : rangeFrom
            ? `from ${rangeFrom}`
            : `until ${rangeTo}`;

    /** Client-side test for an ERPNext Date/Datetime value ("YYYY-MM-DD[ HH:MM:SS]" — the first 10 chars ARE the date). */
    const matches = (value: unknown): boolean => {
      if (!active) return true;
      const d = String(value ?? "").slice(0, 10);
      if (!d) return false;
      return (!rangeFrom || d >= rangeFrom) && (!rangeTo || d <= rangeTo);
    };

    /**
     * The same range as a Frappe filter *condition* for `field` — `[op, value]`, e.g. `["between", [a, b]]` —
     * or null when inactive. A one-sided upper bound uses "< next day" because a bare date compares as
     * midnight, which would otherwise drop everything created later on the last day.
     */
    const condition = (): [string, unknown] | null => {
      if (!active) return null;
      if (rangeFrom && rangeTo) return ["between", [rangeFrom, rangeTo]];
      if (rangeFrom) return [">=", rangeFrom];
      return ["<", addDaysISO(rangeTo, 1)];
    };

    return {
      preset,
      from,
      to,
      setPreset,
      setFrom,
      setTo,
      active,
      display,
      matches,
      /** Frappe list filter triple(s) for `field`: `[[field, op, value]]`, or `[]` when inactive. */
      listFilters: (field: string): unknown[][] => {
        const c = condition();
        return c ? [[field, c[0], c[1]]] : [];
      },
      /** Frappe dict-style filter for `field` (what crm.api.doc.get_data takes): `{ [field]: [op, value] }`, or `{}`. */
      dictFilters: (field: string): Record<string, unknown> => {
        const c = condition();
        return c ? { [field]: c } : {};
      },
      reset: () => {
        setPreset("all");
        setFrom("");
        setTo("");
      },
    };
  }, [preset, from, to]);
}

export type DateRangeFilter = ReturnType<typeof useDateRangeFilter>;

export interface DateFieldOption {
  value: string;
  label: string;
}

/**
 * The dropdown (+ two date pickers for "Custom range"), and — when several `fields` are offered — a
 * dropdown for WHICH date to filter on. `labeled` adds small captions above each control, matching the
 * Leads/Deals filter bars; without it the controls are bare, for CrmManagementPage's compact bar.
 */
export function DateRangeFilterControls({
  filter,
  label = "Date",
  fields,
  field,
  onFieldChange,
  labeled,
}: {
  filter: DateRangeFilter;
  /** Name of the date being filtered, for the "Any …" option and aria labels — e.g. "Due date". */
  label?: string;
  fields?: DateFieldOption[];
  field?: string;
  onFieldChange?: (field: string) => void;
  labeled?: boolean;
}) {
  // `bareWidth`: the wrapper's width in the compact (unlabeled) bar, where the control just fills it.
  const wrap = (caption: string, control: React.ReactNode, key: string, bareWidth: string) =>
    labeled ? (
      <label key={key} className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">{caption}</span>
        {control}
      </label>
    ) : (
      <div key={key} className={bareWidth}>
        {control}
      </div>
    );

  const fieldLabel = fields?.find((f) => f.value === field)?.label ?? label;
  const size = labeled ? "h-8 bg-transparent text-sm" : "";

  return (
    <>
      {fields && fields.length > 1 && field !== undefined && onFieldChange &&
        wrap(
          "Date",
          <Select value={field} onChange={(e) => onFieldChange(e.target.value)} className={labeled ? `${size} w-36` : undefined} aria-label="Which date to filter on">
            {fields.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </Select>,
          "field",
          "w-full sm:w-36",
        )}
      {wrap(
        labeled ? "Range" : fieldLabel,
        <Select
          value={filter.preset}
          onChange={(e) => filter.setPreset(e.target.value as DatePreset)}
          className={labeled ? `${size} w-40` : undefined}
          aria-label={`Filter by ${fieldLabel.toLowerCase()}`}
        >
          <option value="all">{fields && fields.length > 1 ? "Any date" : `Any ${fieldLabel.toLowerCase()}`}</option>
          {DATE_PRESETS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </Select>,
        "preset",
        "w-full sm:w-44",
      )}
      {filter.preset === "custom" && (
        <>
          {wrap(
            "From",
            <Input
              type="date"
              value={filter.from}
              max={filter.to || undefined}
              onChange={(e) => filter.setFrom(e.target.value)}
              className={labeled ? "h-8 w-36 bg-transparent text-sm" : undefined}
              aria-label={`${fieldLabel} from`}
            />,
            "from",
            "w-full sm:w-36",
          )}
          {wrap(
            "To",
            <Input
              type="date"
              value={filter.to}
              min={filter.from || undefined}
              onChange={(e) => filter.setTo(e.target.value)}
              className={labeled ? "h-8 w-36 bg-transparent text-sm" : undefined}
              aria-label={`${fieldLabel} to`}
            />,
            "to",
            "w-full sm:w-36",
          )}
        </>
      )}
    </>
  );
}
