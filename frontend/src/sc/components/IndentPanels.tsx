/**
 * Indenting panels on the generated forms:
 * - BatchPanel (Indent Batch): status counts, the batch's indents per day, and Authorize / Reject / Print / Reprint.
 * - IndentCard (Cane Indent): the printed slip's barcode, validity today, Print / Reprint.
 * Reprints ask for a reason (and a Cane Manager) — the server enforces both.
 */
import { useFrappeGetCall } from "frappe-react-sdk";
import { CheckCircle2, Loader2, Printer, ScanBarcode, Trash2, XCircle } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import type { ExtraContext } from "@/components/doc/doc-config";
import { Button } from "@/sc/components/ui/button";
import { Input } from "@/sc/components/ui/input";
import { post, postDownload } from "@/sc/lib/api";
import { num } from "@/sc/lib/format";
import { cn } from "@/sc/lib/utils";

export const STATUS_TONE: Record<string, string> = {
  Draft: "bg-slate-500/15 text-slate-600 dark:text-slate-300", Authorized: "bg-blue-500/15 text-blue-600 dark:text-blue-300",
  Printed: "bg-teal-500/15 text-teal-700 dark:text-teal-300", Used: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  Expired: "bg-red-500/15 text-red-600 dark:text-red-300", Cancelled: "bg-zinc-500/15 text-zinc-500",
};
const dayLabel = (s: string) => new Date(`${s}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
const err = (e: unknown) => (e as { message?: string })?.message ?? "Failed";

export function StatusPill({ status }: { status: string }) {
  return <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", STATUS_TONE[status] ?? STATUS_TONE.Draft)}>{status}</span>;
}

/** Ask for a reprint reason inline (no browser dialogs). */
function ReprintBox({ onGo, busy, label = "Reprint" }: { onGo: (reason: string) => void; busy: boolean; label?: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  if (!open) return <Button variant="outline" onClick={() => setOpen(true)}><Printer />{label}</Button>;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why reprint? (logged)" className="h-9 w-64" />
      <Button onClick={() => onGo(reason)} disabled={!reason.trim() || busy}>{busy ? <Loader2 className="animate-spin" /> : <Printer />}Print duplicate</Button>
      <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
    </div>
  );
}

interface BatchDetail {
  batch: Record<string, unknown> & { name: string; status: string; docstatus: number; indent_count: number; circle: string };
  indents: { name: string; indent_date: string; grower: string; grower_name: string; village_name?: string; load_maund: number; status: string; print_count: number; source?: string }[];
  status_counts: Record<string, number>; can_authorize: boolean; can_print: boolean;
}

export function BatchPanel({ ctx }: { ctx: ExtraContext }) {
  const name = ctx.name ?? "";
  const navigate = useNavigate();
  const { data, mutate } = useFrappeGetCall<{ message: BatchDetail }>("sugarcane.cane_indenting.api.batch_detail", { name }, `sc-batch-${name}`);
  const [busy, setBusy] = useState<string | null>(null);
  const d = data?.message;
  if (!d) return <div className="h-40 animate-pulse rounded-2xl border bg-muted/40" />;
  const unprinted = d.status_counts.Authorized ?? 0;
  const days = Object.entries(d.indents.reduce<Record<string, typeof d.indents>>((acc, i) => { (acc[i.indent_date] ??= []).push(i); return acc; }, {}));

  const act = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key);
    try { await fn(); toast.success(ok); await mutate(); ctx.reload(); } catch (e) { toast.error(err(e)); } finally { setBusy(null); }
  };
  const print = (reason?: string) => act("print", () => postDownload("sugarcane.cane_indenting.api.print_pdf",
    { batch: name, include_printed: reason ? 1 : 0, reason: reason ?? "" }, `Indents ${name}.pdf`), reason ? "Duplicates printed" : "Indents printed");

  return (
    <section className="space-y-4 rounded-2xl border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-base font-semibold">Indents in this batch</h3>
        {Object.entries(d.status_counts).map(([s, n]) => <span key={s} className="flex items-center gap-1"><StatusPill status={s} /><span className="text-xs tabular-nums text-muted-foreground">{num(n)}</span></span>)}
        <div className="ml-auto flex flex-wrap gap-2">
          {d.can_authorize && <>
            <Button onClick={() => void act("auth", () => post("sugarcane.cane_indenting.api.authorize_batch", { name }), "Batch authorized")} disabled={!!busy}>
              {busy === "auth" ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}Authorize {num(d.batch.indent_count)} indents</Button>
            <Button variant="outline" disabled={!!busy} onClick={() => void act("reject", async () => {
              await post("sugarcane.cane_indenting.api.reject_batch", { name }); navigate("/indenting/d/indent-batch");
            }, "Batch rejected and deleted")}><Trash2 />Reject</Button>
          </>}
          {d.can_print && unprinted > 0 && (
            <Button onClick={() => void print()} disabled={!!busy}>{busy === "print" ? <Loader2 className="animate-spin" /> : <Printer />}Print {num(unprinted)} indents (PDF)</Button>
          )}
          {d.can_print && unprinted === 0 && (d.status_counts.Printed ?? 0) > 0 && <ReprintBox busy={busy === "print"} onGo={(r) => void print(r)} label="Reprint batch" />}
        </div>
      </div>
      {d.batch.docstatus === 0 && <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">Draft: nothing can be printed until a Cane Manager authorizes the batch.</p>}
      <div className="max-h-[32rem] overflow-auto rounded-xl border">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-muted/90 text-[11px] uppercase tracking-wide text-muted-foreground backdrop-blur"><tr>
            <th className="px-3 py-2 text-left">Indent</th><th className="px-3 py-2 text-left">Grower</th><th className="px-3 py-2 text-left">Village</th>
            <th className="px-3 py-2 text-left">Deliver to</th><th className="px-3 py-2 text-right">Load</th><th className="px-3 py-2 text-left">Status</th></tr></thead>
          <tbody>
            {days.map(([day, rows]) => [
              <tr key={day} className="bg-muted/30"><td colSpan={6} className="px-3 py-1.5 text-xs font-semibold">{dayLabel(day)} · {num(rows.length)} indents</td></tr>,
              ...rows.map((i) => (
                <tr key={i.name} className="border-t hover:bg-muted/20">
                  <td className="px-3 py-1.5 font-mono text-xs"><Link to={`/indenting/d/cane-indent/${encodeURIComponent(i.name)}`} className="hover:text-primary hover:underline">{i.name}</Link></td>
                  <td className="px-3 py-1.5">{i.grower_name}<span className="ml-1 text-[11px] text-muted-foreground">{i.grower}</span></td>
                  <td className="px-3 py-1.5 text-muted-foreground">{i.village_name ?? "—"}</td>
                  <td className="px-3 py-1.5 text-muted-foreground">{i.source ?? "—"}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{num(i.load_maund)}</td>
                  <td className="px-3 py-1.5"><StatusPill status={i.status} />{i.print_count > 1 && <span className="ml-1 text-[10px] text-muted-foreground">×{i.print_count}</span>}</td>
                </tr>
              )),
            ])}
          </tbody>
        </table>
      </div>
    </section>
  );
}

interface Lookup {
  found: boolean; indent_no?: string; indent?: Record<string, string | number | null> & { name: string; status: string; docstatus: number };
  usable_today?: boolean; reason?: string | null; barcode?: string; grower_photo?: string | null; days_left?: number | null;
}

export function IndentCard({ ctx }: { ctx: ExtraContext }) {
  const name = ctx.name ?? "";
  const { data, mutate } = useFrappeGetCall<{ message: Lookup }>("sugarcane.cane_indenting.api.lookup", { indent_no: name }, `sc-indent-card-${name}`);
  const [busy, setBusy] = useState(false);
  const l = data?.message;
  if (!l?.found || !l.indent) return null;
  const i = l.indent;
  const print = async (reason?: string) => {
    setBusy(true);
    try {
      await postDownload("sugarcane.cane_indenting.api.print_pdf", { names: JSON.stringify([name]), reason: reason ?? "" }, `Indent ${name}.pdf`);
      toast.success(reason ? "Duplicate printed" : "Indent printed");
      await mutate(); ctx.reload();
    } catch (e) { toast.error(err(e)); } finally { setBusy(false); }
  };
  return <ValidityCard l={l} actions={i.docstatus === 1 && ["Authorized", "Printed"].includes(i.status) ? (
    Number(i.print_count) > 0 ? <ReprintBox busy={busy} onGo={(r) => void print(r)} />
      : <Button onClick={() => void print()} disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <Printer />}Print</Button>
  ) : null} />;
}

/** The slip as the gate sees it: barcode, valid today or why not, grower photo. */
export function ValidityCard({ l, actions }: { l: Lookup; actions?: React.ReactNode }) {
  const i = l.indent!;
  return (
    <section className="grid gap-4 rounded-2xl border bg-card p-4 shadow-sm md:grid-cols-[auto_1fr]">
      <div className="flex flex-col items-center gap-2">
        {l.grower_photo ? <img src={l.grower_photo} alt="" className="size-24 rounded-xl border object-cover" />
          : <span className="grid size-24 place-items-center rounded-xl bg-muted text-muted-foreground"><ScanBarcode className="size-8" /></span>}
        <StatusPill status={String(i.status)} />
      </div>
      <div className="min-w-0 space-y-3">
        <div className={cn("flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold",
          l.usable_today ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-red-500/10 text-red-700 dark:text-red-300")}>
          {l.usable_today ? <CheckCircle2 className="size-5" /> : <XCircle className="size-5" />}
          {l.usable_today ? `Valid today${l.days_left ? ` · ${l.days_left} more day${l.days_left === 1 ? "" : "s"}` : " · last day"}` : `Not valid today — ${l.reason}`}
        </div>
        <div className="overflow-x-auto rounded-lg bg-white p-2" dangerouslySetInnerHTML={{ __html: l.barcode ?? "" }} />
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
          {([["Grower", `${i.grower_name ?? ""}`], ["Village", `${i.village_name ?? ""} · ${i.circle ?? ""}`], ["Supply", `${i.indent_date}`],
            ["Valid", `${i.valid_from} – ${i.valid_to}`], ["Load", `${num(Number(i.load_maund))} md`], ["Deliver to", `${i.source ?? "—"}`],
            ["Batch", `${i.batch ?? "—"}`], ["Printed", `${i.print_count ?? 0}×`]] as const).map(([k, v]) => (
            <div key={k} className="min-w-0"><dt className="text-[11px] text-muted-foreground">{k}</dt><dd className="truncate font-medium" title={v}>{v}</dd></div>
          ))}
        </dl>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </section>
  );
}
