/** Click-to-toggle chart legends (any Recharts chart): each series is a chip — click to hide / show — plus All · None. */
import { cloneElement, useState, type ReactElement } from "react";
import { Legend } from "recharts";
import { cn } from "@/utils/cn";

function AllNone({ allOn, noneOn, onAll, onNone }: { allOn: boolean; noneOn: boolean; onAll: () => void; onNone: () => void }) {
  const b = (on: boolean) => cn("rounded-md px-1.5 py-0.5 text-[11px] font-medium transition", on ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground");
  return (
    <span className="ml-1 inline-flex items-center gap-0.5 rounded-lg border bg-muted/40 p-0.5" role="group" aria-label="Show series">
      <button type="button" className={b(allOn)} onClick={onAll}>All</button>
      <button type="button" className={b(noneOn)} onClick={onNone}>None</button>
    </span>
  );
}

interface LegendItem { value?: string; dataKey?: unknown; color?: string }

export function ToggleLegend({ payload, hidden, onToggle, onSet }: { payload?: LegendItem[]; hidden: Set<string>; onToggle: (k: string) => void; onSet: (keys: string[]) => void }) {
  const items = (payload ?? []).filter((p) => p.dataKey !== undefined);
  const keys = items.map((p) => String(p.dataKey));
  return (
    <div className="flex flex-wrap items-center justify-center gap-1.5 pt-1 text-xs">
      {items.map((p) => {
        const k = String(p.dataKey), off = hidden.has(k);
        return (
          <button key={k} type="button" onClick={() => onToggle(k)} aria-pressed={!off} title={off ? "Show" : "Hide"}
            className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 transition", off ? "border-dashed text-muted-foreground line-through opacity-60" : "bg-card shadow-sm hover:border-primary/40")}>
            <span className="size-2.5 rounded-full" style={{ background: off ? "transparent" : p.color, boxShadow: off ? `inset 0 0 0 1.5px ${p.color}` : undefined }} />
            {p.value}
          </button>
        );
      })}
      {items.length > 1 && <AllNone allOn={hidden.size === 0} noneOn={keys.every((k) => hidden.has(k))} onAll={() => onSet([])} onNone={() => onSet(keys)} />}
    </div>
  );
}

/** Put `lt.legend` inside the chart and pass its series through `lt.series([...])` (they get `hide` when switched off). */
export function useLegendToggle() {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const toggle = (k: string) => setHidden((prev) => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const set = (keys: string[]) => setHidden(new Set(keys));
  return {
    hidden,
    toggle,
    legend: <Legend content={<ToggleLegend hidden={hidden} onToggle={toggle} onSet={set} />} />,
    series: (els: ReactElement<{ dataKey?: unknown; hide?: boolean }>[]) =>
      els.map((el, i) => cloneElement(el, { key: el.key ?? String(el.props.dataKey ?? i), hide: hidden.has(String(el.props.dataKey)) })),
  };
}
