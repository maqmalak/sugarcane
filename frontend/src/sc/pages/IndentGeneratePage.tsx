/**
 * Generate indents (/indenting/generate): pick the supply dates (and a circle, or all), see what would be created —
 * per day against the daily capacity, per circle against the numbers left in its indent range, fields held back for an
 * overlap review — then generate one draft batch per circle for a Cane Manager to authorize.
 * Data: sugarcane.cane_indenting.api.preview / generate.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, CalendarRange, CheckCircle2, ClipboardList, Layers, Loader2, PauseCircle, Wand2 } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { C, KpiCard } from "@/sc/components/analytics/kit";
import { Button } from "@/sc/components/ui/button";
import { Input, Select } from "@/sc/components/ui/input";
import { Skeleton } from "@/sc/components/ui/skeleton";
import { get, post } from "@/sc/lib/api";
import { num } from "@/sc/lib/format";
import { cn } from "@/sc/lib/utils";

interface Preview {
  season: string; from_date: string; to_date: string; circle?: string | null;
  standards: { load_maund: number; validity_days: number; per_day: number; intake_maund: number; intake_derived: boolean; first: string; end: string; partial_pct: number };
  new: number; new_maund: number;
  days: { date: string; new: number; existing: number; capacity: number; maund: number }[];
  by_circle: { circle: string; new: number; maund: number; growers: number; numbers_left: number; short: number }[];
  held: { survey: string; grower: string; grower_name: string; circle: string; expected: number }[]; held_count: number;
  unplaced: number;
  season_totals: { growers: number; expected: number; entitled: number; loads: number; issued: number };
  warnings: string[]; can_generate: boolean;
}
interface Result { batches: { name: string; circle: string; indents: number; maund: number }[]; indents: number }

const iso = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const addDays = (s: string, n: number) => { const d = new Date(`${s}T00:00:00`); d.setDate(d.getDate() + n); return iso(d); };
const dayLabel = (s: string) => new Date(`${s}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
const kmd = (v: number) => (Math.abs(v) >= 1e6 ? `${(v / 1e6).toFixed(2)}M md` : `${num(Math.round(v / 1000))}k md`);

export function IndentGeneratePage() {
  const qc = useQueryClient();
  const { data: circles } = useQuery({ queryKey: ["sc-circles"], queryFn: () => post<{ name: string; circle_code: string }[]>("frappe.client.get_list",
    { doctype: "Cane Circle", fields: ["name", "circle_code"], order_by: "circle_code asc", limit_page_length: 500 }) });
  const [form, setForm] = useState<{ from: string; to: string; circle: string }>({ from: "", to: "", circle: "" });
  const [args, setArgs] = useState<Record<string, string>>({});
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const { data: p, isFetching, error } = useQuery({
    queryKey: ["sc-indent-preview", args],
    queryFn: () => get<Preview>("sugarcane.cane_indenting.api.preview", args),
  });
  // the first preview picks the default dates (next 7 days from today or the season start); show them in the form
  if (p && !form.from) setForm({ from: p.from_date, to: p.to_date, circle: p.circle ?? "" });

  const run = () => { setResult(null); setArgs({ from_date: form.from, to_date: form.to, ...(form.circle ? { circle: form.circle } : {}) }); };
  const generate = async () => {
    setBusy(true);
    try {
      const r = await post<Result>("sugarcane.cane_indenting.api.generate", { from_date: form.from, to_date: form.to, ...(form.circle ? { circle: form.circle } : {}) });
      setResult(r);
      toast.success(`${num(r.indents)} indents in ${r.batches.length} batch(es) — waiting for authorization`);
      void qc.invalidateQueries({ queryKey: ["sc-indent-preview"] });
      void qc.invalidateQueries({ queryKey: ["sc-indent-insights"] });
    } catch (e) {
      toast.error((e as { message?: string })?.message ?? "Could not generate");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <div>
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-violet-600"><ClipboardList className="size-4" />Indenting</div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Generate indents</h1>
        <p className="text-sm text-muted-foreground">Surveyed cane × quota % → loads per grower, spread through each quota rule's supply window and fitted to the daily intake</p>
      </div>

      <section className="flex flex-wrap items-end gap-3 rounded-2xl border bg-card p-4 shadow-sm">
        <label className="text-sm"><span className="mb-1 block text-xs text-muted-foreground">Supply from</span>
          <Input type="date" value={form.from} onChange={(e) => setForm((f) => ({ ...f, from: e.target.value, to: f.to < e.target.value ? addDays(e.target.value, 6) : f.to }))} className="h-9 w-40" /></label>
        <label className="text-sm"><span className="mb-1 block text-xs text-muted-foreground">Supply to</span>
          <Input type="date" value={form.to} min={form.from} onChange={(e) => setForm((f) => ({ ...f, to: e.target.value }))} className="h-9 w-40" /></label>
        <label className="text-sm"><span className="mb-1 block text-xs text-muted-foreground">Circle</span>
          <Select value={form.circle} onChange={(e) => setForm((f) => ({ ...f, circle: e.target.value }))} className="h-9 w-52">
            <option value="">All circles</option>
            {(circles ?? []).map((c) => <option key={c.name} value={c.name}>{c.circle_code} · {c.name}</option>)}
          </Select></label>
        <div className="flex gap-1.5">
          {[["Next 7 days", 6], ["Next 14 days", 13]].map(([label, n]) => (
            <button key={label} type="button" onClick={() => form.from && setForm((f) => ({ ...f, to: addDays(f.from, Number(n)) }))}
              className="h-9 rounded-lg border px-2.5 text-xs hover:bg-accent">{label}</button>
          ))}
        </div>
        <Button variant="outline" onClick={run} disabled={!form.from || !form.to || isFetching}>
          {isFetching ? <Loader2 className="animate-spin" /> : <CalendarRange />}Preview
        </Button>
        <Button onClick={() => void generate()} disabled={!p?.can_generate || busy || isFetching} className="ml-auto">
          {busy ? <Loader2 className="animate-spin" /> : <Wand2 />}Generate {p?.new ? num(p.new) : ""} indents
        </Button>
      </section>

      {error && <p className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">{(error as Error).message}</p>}

      {result && (
        <section className="rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.07] p-4">
          <div className="flex items-center gap-2 font-semibold text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="size-5" />
            {num(result.indents)} indents created as {result.batches.length} draft batch(es)</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {result.batches.map((b) => (
              <Link key={b.name} to={`/indenting/d/indent-batch/${encodeURIComponent(b.name)}`}
                className="inline-flex items-center gap-2 rounded-lg border bg-card px-3 py-1.5 text-sm hover:bg-accent">
                <Layers className="size-4 text-primary" />{b.name} · {b.circle} · {num(b.indents)}<ArrowRight className="size-3.5" />
              </Link>
            ))}
            <Link to="/approvals/inbox" className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground">Authorize in the inbox<ArrowRight className="size-3.5" /></Link>
          </div>
        </section>
      )}

      {!p ? <div className="grid gap-4 md:grid-cols-2">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-40 rounded-2xl" />)}</div> : (
        <>
          {p.warnings.length > 0 && (
            <ul className="space-y-1.5">
              {p.warnings.map((w) => <li key={w} className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/[0.07] px-3 py-2 text-sm text-amber-900 dark:text-amber-200"><AlertTriangle className="mt-0.5 size-4 shrink-0" />{w}</li>)}
            </ul>
          )}

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard icon={Wand2} label="Would be created" value={`${num(p.new)} indents`} color={C.violet} sub={`${kmd(p.new_maund)} · ${dayLabel(p.from_date)} – ${dayLabel(p.to_date)}`} />
            <KpiCard icon={ClipboardList} label="Season entitlement" value={`${num(p.season_totals.loads)} loads`} color={C.green}
              sub={`${num(p.season_totals.growers)} growers · ${kmd(p.season_totals.entitled)} of ${kmd(p.season_totals.expected)} surveyed`} />
            <KpiCard icon={Layers} label="Issued so far" value={num(p.season_totals.issued)} color={C.blue}
              progress={p.season_totals.loads ? Math.min(100, (100 * p.season_totals.issued) / p.season_totals.loads) : 0}
              sub={`${p.season_totals.loads ? Math.round((100 * p.season_totals.issued) / p.season_totals.loads) : 0}% of the season's loads`} />
            <KpiCard icon={PauseCircle} label="Held back" value={`${num(p.held_count)} fields`} color={p.held_count ? C.amber : C.slate}
              sub={p.held_count ? "waiting for an overlap decision" : "nothing held"} to={p.held_count ? "/approvals/inbox" : undefined} />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
              <header className="border-b px-4 py-3"><h3 className="font-semibold">By supply day</h3>
                <p className="text-xs text-muted-foreground">{num(p.standards.per_day)} indents a day at {kmd(p.standards.intake_maund)} intake{p.standards.intake_derived ? " (crushing target ÷ season days)" : ""} · {num(p.standards.load_maund)} md each · valid {p.standards.validity_days} days</p></header>
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground"><tr>
                  <th className="px-4 py-2 text-left">Day</th><th className="px-3 py-2 text-right">Already</th><th className="px-3 py-2 text-right">New</th><th className="w-48 px-4 py-2 text-left">Capacity used</th></tr></thead>
                <tbody className="divide-y">
                  {p.days.map((d) => {
                    const used = d.capacity ? Math.round((100 * (d.existing + d.new)) / d.capacity) : 0;
                    return (
                      <tr key={d.date}>
                        <td className="px-4 py-2 font-medium">{dayLabel(d.date)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{d.existing ? num(d.existing) : "—"}</td>
                        <td className="px-3 py-2 text-right font-semibold tabular-nums">{d.new ? num(d.new) : "—"}</td>
                        <td className="px-4 py-2"><div className="flex items-center gap-2">
                          <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                            <div className="h-full bg-slate-400" style={{ width: `${Math.min(100, d.capacity ? (100 * d.existing) / d.capacity : 0)}%`, float: "left" }} />
                            <div className="h-full bg-primary" style={{ width: `${Math.min(100, d.capacity ? (100 * d.new) / d.capacity : 0)}%`, float: "left" }} />
                          </div><span className={cn("w-10 text-right text-xs tabular-nums", used > 90 && "font-semibold text-amber-600")}>{used}%</span></div></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>

            <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
              <header className="border-b px-4 py-3"><h3 className="font-semibold">By circle</h3>
                <p className="text-xs text-muted-foreground">One draft batch per circle · numbers come from the circle's indent range</p></header>
              {p.by_circle.length ? (
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground"><tr>
                    <th className="px-4 py-2 text-left">Circle</th><th className="px-3 py-2 text-right">Indents</th><th className="px-3 py-2 text-right">Growers</th>
                    <th className="px-3 py-2 text-right">Maund</th><th className="px-4 py-2 text-right">Numbers left</th></tr></thead>
                  <tbody className="divide-y">
                    {p.by_circle.map((c) => (
                      <tr key={c.circle}>
                        <td className="px-4 py-2 font-medium">{c.circle}</td>
                        <td className="px-3 py-2 text-right font-semibold tabular-nums">{num(c.new)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{num(c.growers)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{num(c.maund)}</td>
                        <td className={cn("px-4 py-2 text-right tabular-nums", c.short ? "font-semibold text-red-600" : "text-muted-foreground")}>
                          {num(c.numbers_left)}{c.short ? ` (${num(c.short)} short)` : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <p className="p-6 text-sm text-muted-foreground">Nothing new for these dates — every load in this window already has an indent.</p>}
            </section>
          </div>

          {p.held.length > 0 && (
            <section className="rounded-2xl border bg-card p-4 shadow-sm">
              <h3 className="flex items-center gap-2 font-semibold"><PauseCircle className="size-4 text-amber-500" />Held back for an overlap decision</h3>
              <p className="text-xs text-muted-foreground">These fields get indents as soon as their overlap review is accepted.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {p.held.slice(0, 40).map((h) => (
                  <Link key={h.survey} to={`/survey/d/cane-survey/${encodeURIComponent(h.survey)}`} className="rounded-lg border px-2.5 py-1 text-xs hover:bg-accent">
                    <b>{h.grower_name}</b> · {h.circle} · {num(Math.round(h.expected))} md
                  </Link>
                ))}
                {p.held.length > 40 && <span className="px-2 py-1 text-xs text-muted-foreground">+{p.held.length - 40} more</span>}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
