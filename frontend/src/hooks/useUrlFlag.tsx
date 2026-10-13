import { useSearchParams } from "react-router-dom";

/**
 * A boolean list filter carried in the URL (e.g. `?overdue=1`, `?late=1`), set by the home page's
 * "Needs attention" cards. Returns whether it's on and a chip that turns it off (keeps other params).
 */
export function useUrlFlag(param: string, label: string) {
  const [params, setParams] = useSearchParams();
  const active = params.get(param) === "1";
  const clear = () => {
    const next = new URLSearchParams(params);
    next.delete(param);
    setParams(next, { replace: true });
  };
  const chip = active ? (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-muted-foreground">Showing</label>
      <button
        type="button"
        onClick={clear}
        title="Remove this filter"
        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-rose-500/40 bg-rose-500/10 px-2.5 text-xs font-medium text-rose-600 hover:bg-rose-500/20 dark:text-rose-400"
      >
        {label} <span aria-hidden>✕</span>
      </button>
    </div>
  ) : null;
  return { active, clear, chip };
}

/** Today / N days ago as YYYY-MM-DD (local date), for the flag filters. */
export function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; // local date, not UTC
}

/** Now as "YYYY-MM-DD HH:mm:ss" (local time), for datetime filters. */
export function nowLocal(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${isoDaysAgo(0)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
