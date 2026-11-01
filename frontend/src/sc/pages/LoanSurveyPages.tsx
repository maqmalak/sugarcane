/**
 * Grower loans — the loan field survey and the grower's history:
 * - LoanSteps: where a loan is (requested → field survey → approved → disbursed → recovered, or rejected).
 * - VerificationCard: send a request to a surveyor; the surveyor's findings, photos and recommendation.
 * - GrowerHistory: every previous loan and how it was repaid, and the cane supplied each season.
 * - LoanSurveysPage (/accounts/loan-surveys): the surveyor's list of loan field visits and the visit form
 *   (acres seen, crop condition and stage, expected yield, GPS, two photos, recommendation).
 */
import { useQuery } from "@tanstack/react-query";
import { Camera, ClipboardCheck, Crosshair, HandCoins, History, MapPin, Send, Sprout } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";
import { Link, useSearchParams } from "react-router-dom";
import { ChartCard, DataTable } from "@/sc/components/analytics/kit";
import { Badge, type Tone } from "@/sc/components/ui/badge";
import { Button } from "@/sc/components/ui/button";
import { Input } from "@/sc/components/ui/input";
import { get, post } from "@/sc/lib/api";
import { money, num } from "@/sc/lib/format";
import { cn } from "@/sc/lib/utils";
import { uploadFile } from "@/services/frappe";

const API = "sugarcane.api.v1.accounts";
const err = (e: unknown) => (e instanceof Error ? e.message : String(e));
const fmt = (s?: string | null) => (s ? s.slice(0, 16).replace("T", " ") : "—");

export interface LoanSurvey {
  name: string; grower: string; grower_name: string; circle?: string; loan_type: string; status: string; docstatus: number; amount: number;
  requested_amount?: number; eligible_amount?: number; surveyed_acres: number; expected_cane_maund?: number; expected_cane_value?: number;
  verification_status?: string; surveyor?: string; verification_requested_on?: string; verified_on?: string; verified_acres?: number;
  crop_condition?: string; crop_stage?: string; expected_maund_per_acre?: number; recommendation?: string; recommended_amount?: number;
  verification_latitude?: number; verification_longitude?: number; verification_photo_1?: string; verification_photo_2?: string;
  verification_remarks?: string; reject_reason?: string; village_name?: string; application_date?: string; disbursed_on?: string; outstanding?: number;
}

const REC_TONE: Record<string, Tone> = { Recommend: "green", "Recommend a lower amount": "amber", "Do not recommend": "red" };

/** Requested → field survey → approved → disbursed → recovered. */
export function LoanSteps({ l }: { l: LoanSurvey }) {
  const needs = l.verification_status !== "Not needed";
  const steps = [
    { k: "Requested", done: true },
    ...(needs ? [{ k: "Field survey", done: l.verification_status === "Verified" }] : []),
    { k: "Approved", done: l.docstatus === 1 },
    { k: "Disbursed", done: ["Disbursed", "Recovered", "Written Off"].includes(l.status) },
    { k: "Recovered", done: l.status === "Recovered" },
  ];
  const at = steps.findIndex((s) => !s.done);
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold">
      {steps.map((s, i) => (
        <span key={s.k} className="flex items-center gap-1.5">
          <span className={cn("rounded-full border px-2.5 py-1", l.status === "Rejected" && i >= Math.max(at, 1) ? "border-red-500/40 bg-red-500/10 text-red-600"
            : s.done ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : i === at ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground")}>
            {s.done ? "✓ " : `${i + 1} · `}{s.k}</span>
          {i < steps.length - 1 && <span className="text-muted-foreground">→</span>}
        </span>
      ))}
      {l.status === "Rejected" && <Badge tone="red">Rejected{l.reject_reason ? ` — ${l.reject_reason}` : ""}</Badge>}
    </div>
  );
}

/** The field survey of a loan: who goes, and what they found. */
export function VerificationCard({ l, canAssign, onChange }: { l: LoanSurvey; canAssign: boolean; onChange: () => void }) {
  const { data: people } = useQuery({ queryKey: ["sc-surveyors"], enabled: canAssign, queryFn: () => get<{ name: string; full_name: string }[]>(`${API}.surveyors`) });
  const [who, setWho] = useState(l.surveyor ?? "");
  if (l.verification_status === "Not needed") return null;
  const verified = l.verification_status === "Verified";
  return (
    <section className={cn("rounded-xl border-2 p-3", verified ? (l.recommendation === "Do not recommend" ? "border-red-500/50" : "border-emerald-500/40") : "border-amber-500/50")}>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-sm font-semibold"><Sprout className="size-4 text-emerald-600" />Field survey for the loan
        <Badge tone={verified ? "green" : "amber"}>{verified ? "Verified" : l.surveyor ? "Pending — with the surveyor" : "Pending — not sent"}</Badge>
        {l.surveyor && <span className="text-xs font-normal text-muted-foreground">{l.surveyor} · sent {fmt(l.verification_requested_on)}{verified ? ` · visited ${fmt(l.verified_on)}` : ""}</span>}
      </div>
      {!verified && canAssign && l.docstatus === 0 && l.status !== "Rejected" && (
        <div className="flex flex-wrap items-center gap-2">
          <select value={who} onChange={(e) => setWho(e.target.value)} className="h-9 min-w-64 rounded-lg border bg-background px-2 text-sm">
            <option value="">Choose the surveyor / circle officer</option>{(people ?? []).map((p) => <option key={p.name} value={p.name}>{p.full_name || p.name}</option>)}</select>
          <Button size="sm" disabled={!who} onClick={async () => { try { await post(`${API}.request_verification`, { name: l.name, surveyor: who }); toast.success(`Sent to ${who} for a field survey`); onChange(); } catch (e) { toast.error(err(e)); } }}>
            <Send />{l.surveyor ? "Send again" : "Send for field survey"}</Button>
          <span className="text-xs text-muted-foreground">The Cane Manager can approve only after the survey.</span>
        </div>
      )}
      {verified && (
        <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
          <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
            {[["Acres in the field", `${l.verified_acres} (survey ${l.surveyed_acres})`], ["Crop condition", l.crop_condition], ["Crop stage", l.crop_stage ?? "—"],
              ["Expected yield", `${num(l.expected_maund_per_acre ?? 0)} md / acre`], ["Recommendation", l.recommendation],
              ["Recommended amount", l.recommended_amount ? money(l.recommended_amount) : "—"]].map(([k, v]) => (
              <div key={k} className="rounded-lg bg-muted/40 p-2"><div className="text-[11px] text-muted-foreground">{k}</div>
                <div className="font-semibold">{k === "Recommendation" ? <Badge tone={REC_TONE[String(v)] ?? "gray"}>{v}</Badge> : v}</div></div>
            ))}
            {l.verification_remarks && <div className="col-span-full text-xs text-muted-foreground">“{l.verification_remarks}”</div>}
            {l.verification_latitude ? <a className="col-span-full flex items-center gap-1 text-xs text-primary hover:underline" target="_blank" rel="noreferrer"
              href={`https://maps.google.com/?q=${l.verification_latitude},${l.verification_longitude}`}><MapPin className="size-3.5" />{l.verification_latitude?.toFixed(5)}, {l.verification_longitude?.toFixed(5)} — where the photos were taken</a> : null}
          </div>
          <div className="flex gap-2">
            {[l.verification_photo_1, l.verification_photo_2].filter(Boolean).map((u) => (
              <a key={u} href={u} target="_blank" rel="noreferrer"><img src={u} alt="field" className="h-28 w-40 rounded-lg border object-cover" /></a>))}
          </div>
        </div>
      )}
    </section>
  );
}

interface History {
  grower?: { name: string; grower_name: string; father_name?: string; cnic?: string; village_name?: string; circle?: string };
  loans: { name: string; season: string; loan_type: string; amount: number; markup_accrued: number; recovered: number; outstanding: number; status: string; recovered_pct: number; last_recovery?: string; disbursed_on?: string }[];
  cane: { season: string; cprs: number; maund: number; paid_value: number; loan_recovered: number }[];
  rejected: number; totals: { loans: number; borrowed: number; recovered: number; outstanding: number; written_off: number };
}
const LT: Record<string, Tone> = { Approved: "blue", Disbursed: "amber", Recovered: "green", "Written Off": "red", Cancelled: "gray" };

/** Previous loans and cane supplied — what the loan decision rests on. */
export function GrowerHistory({ grower }: { grower: string }) {
  const { data: h } = useQuery({ queryKey: ["sc-grower-history", grower], enabled: grower.length >= 10, retry: false, queryFn: () => get<History>(`${API}.grower_history`, { grower }) });
  if (!h) return null;
  const t = h.totals;
  return (
    <section className="rounded-xl border p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-sm font-semibold"><History className="size-4" />Grower history
        <span className="text-xs font-normal text-muted-foreground">{t.loans} previous loan(s) · borrowed {money(t.borrowed)} · recovered {money(t.recovered)} ·
          outstanding <b className={t.outstanding ? "text-amber-600" : ""}>{money(t.outstanding)}</b>{t.written_off ? <> · <b className="text-red-600">{t.written_off} written off</b></> : null}{h.rejected ? ` · ${h.rejected} rejected` : ""}</span>
        <Link to={`/accounts/grower?g=${grower}`} className="ml-auto text-xs text-primary hover:underline">Full statement →</Link>
      </div>
      <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
        <DataTable rows={h.loans} rowKey={(r) => r.name} dense cols={[
          { key: "n", label: "Loan", value: (r) => r.name, render: (r) => <span className="font-mono text-xs">{r.name}</span> },
          { key: "s", label: "Season · type", value: (r) => r.season, render: (r) => <span className="text-xs">{r.season} · {r.loan_type}</span> },
          { key: "a", label: "Loan", align: "right", value: (r) => r.amount, render: (r) => money(r.amount) },
          { key: "r", label: "Recovered", align: "right", value: (r) => r.recovered_pct, render: (r) => <span className={cn("text-xs font-semibold", r.recovered_pct >= 100 ? "text-emerald-600" : r.recovered_pct >= 50 ? "text-amber-600" : "text-red-600")}>{r.recovered_pct}%</span> },
          { key: "o", label: "Outstanding", align: "right", value: (r) => r.outstanding, render: (r) => money(r.outstanding) },
          { key: "st", label: "", value: (r) => r.status, render: (r) => <Badge tone={LT[r.status] ?? "gray"}>{r.status}</Badge> },
        ]} />
        <DataTable rows={h.cane} rowKey={(r) => r.season} dense cols={[
          { key: "s", label: "Season", value: (r) => r.season },
          { key: "c", label: "CPRs", align: "right", value: (r) => r.cprs },
          { key: "m", label: "Cane (md)", align: "right", value: (r) => r.maund, render: (r) => num(r.maund) },
          { key: "v", label: "Paid", align: "right", value: (r) => r.paid_value, render: (r) => money(r.paid_value, { compact: true }) },
          { key: "l", label: "Loan cut", align: "right", value: (r) => r.loan_recovered, render: (r) => money(r.loan_recovered, { compact: true }) },
        ]} />
      </div>
      {!h.loans.length && !h.cane.length && <p className="text-sm text-muted-foreground">No previous loans or cane supplied — a new grower.</p>}
    </section>
  );
}

/** One field visit: what the surveyor fills in at the grower's field (phone or tablet). */
function SurveyForm({ l, onDone }: { l: LoanSurvey; onDone: () => void }) {
  const [v, setV] = useState({ verified_acres: String(l.surveyed_acres || ""), crop_condition: "", crop_stage: "", expected_maund_per_acre: "", recommendation: "", recommended_amount: "", remarks: "" });
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null);
  const [photos, setPhotos] = useState<(string | null)[]>([null, null]);
  const [busy, setBusy] = useState(false);
  const pick = async (i: number, f?: File) => {
    if (!f) return;
    try { const r = await uploadFile(f, { doctype: "Grower Loan", docname: l.name, isPrivate: true }); setPhotos((p) => p.map((x, j) => (j === i ? r.file_url : x))); toast.success("Photo saved"); }
    catch (e) { toast.error(err(e)); }
  };
  const locate = () => navigator.geolocation?.getCurrentPosition((p) => setGps({ lat: p.coords.latitude, lng: p.coords.longitude }),
    () => toast.error("Location not available — allow location on this phone"), { enableHighAccuracy: true, timeout: 10000 });
  const Chips = ({ field, opts }: { field: "crop_condition" | "crop_stage" | "recommendation"; opts: string[] }) => (
    <div className="flex flex-wrap gap-1.5">{opts.map((o) => (
      <button key={o} type="button" onClick={() => setV({ ...v, [field]: o })} className={cn("rounded-full border px-3 py-1.5 text-xs font-semibold",
        v[field] === o ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground")}>{o}</button>))}</div>
  );
  const ok = Number(v.verified_acres) > 0 && v.crop_condition && v.recommendation && photos[0] &&
    (v.recommendation !== "Recommend a lower amount" || (Number(v.recommended_amount) > 0 && Number(v.recommended_amount) < l.amount)) &&
    (v.recommendation !== "Do not recommend" || v.remarks.trim());
  return (
    <section className="space-y-3 rounded-2xl border-2 border-primary/40 bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2"><h3 className="text-lg font-semibold">{l.grower_name}</h3><span className="font-mono text-xs text-muted-foreground">{l.grower} · {l.name}</span>
        <span className="ml-auto text-sm">{l.loan_type} · <b>{money(l.amount)}</b> asked</span></div>
      <p className="text-xs text-muted-foreground">{l.village_name} · {l.circle} · season survey: {l.surveyed_acres} acres, {num(l.expected_cane_maund ?? 0)} md expected. Go to the field and record what you see.</p>
      <label className="block text-xs font-medium text-muted-foreground">Acres of cane seen in the field
        <Input value={v.verified_acres} onChange={(e) => setV({ ...v, verified_acres: e.target.value.replace(/[^\d.]/g, "") })} inputMode="decimal" className="mt-1 w-40" /></label>
      <div><p className="mb-1 text-xs font-medium text-muted-foreground">Crop condition</p><Chips field="crop_condition" opts={["Excellent", "Good", "Average", "Poor", "Failed"]} /></div>
      <div><p className="mb-1 text-xs font-medium text-muted-foreground">Crop stage</p><Chips field="crop_stage" opts={["Germination", "Tillering", "Grand growth", "Maturity"]} /></div>
      <label className="block text-xs font-medium text-muted-foreground">Expected yield (maund per acre)
        <Input value={v.expected_maund_per_acre} onChange={(e) => setV({ ...v, expected_maund_per_acre: e.target.value.replace(/[^\d.]/g, "") })} inputMode="decimal" className="mt-1 w-40" /></label>
      <div className="grid gap-2 sm:grid-cols-3">
        {[0, 1].map((i) => (
          <label key={i} className={cn("flex h-28 cursor-pointer flex-col items-center justify-center gap-1 overflow-hidden rounded-xl border-2 border-dashed text-xs text-muted-foreground", photos[i] && "border-emerald-500")}>
            {photos[i] ? <img src={photos[i]!} alt="" className="h-full w-full object-cover" /> : <><Camera className="size-6" />Field photo {i + 1}{i === 0 ? " (required)" : ""}</>}
            <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => pick(i, e.target.files?.[0])} />
          </label>
        ))}
        <button type="button" onClick={locate} className={cn("flex h-28 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed text-xs", gps ? "border-emerald-500 text-emerald-600" : "text-muted-foreground")}>
          <Crosshair className="size-6" />{gps ? `${gps.lat.toFixed(5)}, ${gps.lng.toFixed(5)}` : "Record GPS location"}</button>
      </div>
      <div><p className="mb-1 text-xs font-medium text-muted-foreground">Your recommendation</p><Chips field="recommendation" opts={["Recommend", "Recommend a lower amount", "Do not recommend"]} /></div>
      {v.recommendation === "Recommend a lower amount" && (
        <label className="block text-xs font-medium text-muted-foreground">Amount you recommend (less than {money(l.amount)})
          <Input value={v.recommended_amount} onChange={(e) => setV({ ...v, recommended_amount: e.target.value.replace(/\D/g, "") })} inputMode="numeric" className="mt-1 w-48" /></label>)}
      <label className="block text-xs font-medium text-muted-foreground">Remarks{v.recommendation === "Do not recommend" ? " (why — required)" : ""}
        <Input value={v.remarks} onChange={(e) => setV({ ...v, remarks: e.target.value })} className="mt-1" placeholder="e.g. good stand, irrigated; patchy near the canal" /></label>
      <Button className="h-11 w-full" disabled={busy || !ok} onClick={async () => {
        setBusy(true);
        try {
          await post(`${API}.verify_loan`, { name: l.name, ...v, latitude: gps?.lat ?? "", longitude: gps?.lng ?? "", photo_1: photos[0] ?? "", photo_2: photos[1] ?? "" });
          toast.success("Field survey saved — sent to the Cane Manager"); onDone();
        } catch (e) { toast.error(err(e)); } finally { setBusy(false); }
      }}><ClipboardCheck />{busy ? "Saving…" : "Submit field survey"}</Button>
    </section>
  );
}

export function LoanSurveysPage() {
  const [params] = useSearchParams();
  const [open, setOpen] = useState(params.get("loan") ?? "");
  const [status, setStatus] = useState("Pending");
  const { data, refetch } = useQuery({ queryKey: ["sc-loan-surveys", status], queryFn: () => get<LoanSurvey[]>(`${API}.loan_verifications`, { status }) });
  const cur = data?.find((r) => r.name === open);
  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
      <div><p className="text-xs font-semibold uppercase tracking-wider text-primary">Grower loans</p>
        <h1 className="text-2xl font-bold">Loan field surveys</h1>
        <p className="text-sm text-muted-foreground">Loans sent to you for a field visit: check the cane, take photos, record the location and recommend. The Cane Manager approves after your survey.</p></div>
      <div className="flex gap-2">{[["Pending", "To visit"], ["Verified", "Done"]].map(([k, l]) => (
        <button key={k} type="button" onClick={() => { setStatus(k); setOpen(""); }} className={cn("rounded-full border px-3 py-1 text-xs font-medium", status === k ? "border-primary/40 bg-primary/10 text-primary" : "text-muted-foreground")}>{l}</button>))}</div>
      {cur && status === "Pending" && <SurveyForm key={cur.name} l={cur} onDone={() => { setOpen(""); refetch(); }} />}
      {cur && <GrowerHistory grower={cur.grower} />}
      <ChartCard title={status === "Pending" ? "Field visits to do" : "Field visits done"} bodyClass="h-auto">
        <DataTable rows={data ?? []} rowKey={(r) => r.name} dense cols={[
          { key: "n", label: "Loan", value: (r) => r.name, render: (r) => <button type="button" onClick={() => setOpen(r.name)} className="font-mono text-xs font-semibold text-primary hover:underline">{r.name}</button> },
          { key: "g", label: "Grower", value: (r) => r.grower_name, render: (r) => <>{r.grower_name}<div className="text-[11px] text-muted-foreground">{r.village_name} · {r.circle}</div></> },
          { key: "t", label: "Type", value: (r) => r.loan_type },
          { key: "a", label: "Asked", align: "right", value: (r) => r.amount, render: (r) => money(r.amount) },
          { key: "ac", label: "Survey acres", align: "right", value: (r) => r.surveyed_acres },
          { key: "s", label: status === "Pending" ? "Sent" : "Visited", value: (r) => r.verification_requested_on ?? "", render: (r) => <span className="text-xs">{fmt(status === "Pending" ? r.verification_requested_on : r.verified_on)}</span> },
          { key: "r", label: "", value: (r) => r.recommendation ?? "", render: (r) => r.recommendation ? <Badge tone={REC_TONE[r.recommendation] ?? "gray"}>{r.recommendation}</Badge>
            : <Button size="sm" variant="outline" onClick={() => setOpen(r.name)}><HandCoins />Open</Button> },
        ]} />
        {!data?.length && <p className="p-6 text-center text-sm text-muted-foreground">{status === "Pending" ? "No field visits waiting." : "None yet."}</p>}
      </ChartCard>
    </div>
  );
}

