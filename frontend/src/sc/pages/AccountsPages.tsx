/**
 * Cane accounts & grower loans (Phase 6):
 * - AccountsDashboardPage (/accounts): payable to growers and its ageing, payments made, road cess, loans, control checks.
 * - ScrollPage (/accounts/scroll?name=): build a payment scroll by scanning CPR barcodes (or adding a day's unpaid CPRs), pay it,
 *   download the bank file.
 * - CessPage (/accounts/cess): cess to deposit by month, deposit with the challan, past deposits.
 * - LoansPage (/accounts/loans): apply, approve, disburse, repay; markup for a month; a loan's entries.
 * - StatementPage (/accounts/grower?g=): a grower's cane and loan ledger with a running balance, CPRs and loans.
 * Data: sugarcane.api.v1.accounts.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Banknote, CheckCircle2, ClipboardCheck, Download, FileText, HandCoins, Landmark, Plus, Receipt, ScanBarcode, Search, Users, Wallet, XCircle } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import toast from "react-hot-toast";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { C, ChartCard, ChartTip, DataTable, KpiCard, useChartTheme } from "@/sc/components/analytics/kit";
import { Badge, type Tone } from "@/sc/components/ui/badge";
import { Button } from "@/sc/components/ui/button";
import { Input } from "@/sc/components/ui/input";
import { Skeleton } from "@/sc/components/ui/skeleton";
import { get, post, postDownload } from "@/sc/lib/api";
import { money, num } from "@/sc/lib/format";
import { cn } from "@/sc/lib/utils";
import { useTheme } from "@/sc/providers/theme";
import { GrowerHistory, LoanSteps, VerificationCard, type LoanSurvey } from "@/sc/pages/LoanSurveyPages";

const API = "sugarcane.api.v1.accounts";
const err = (e: unknown) => (e instanceof Error ? e.message : String(e));
const dayLabel = (s?: string | null) => (s ? new Date(`${s.slice(0, 10)}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—");
const today = () => new Date().toISOString().slice(0, 10);

function Header({ title, sub, children }: { title: string; sub: string; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-indigo-600"><Landmark className="size-4" />Cane accounts</div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        <p className="text-sm text-muted-foreground">{sub}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}
const NavBtn = ({ to, icon: Icon, children }: { to: string; icon: typeof Wallet; children: ReactNode }) => (
  <Link to={to} className="inline-flex h-9 items-center gap-2 rounded-lg border bg-card px-3 text-sm font-semibold hover:bg-accent"><Icon className="size-4" />{children}</Link>
);
const LOAN_TONE: Record<string, Tone> = { Rejected: "red", Draft: "gray", Approved: "blue", Disbursed: "amber", Recovered: "green", "Written Off": "red", Cancelled: "gray" };

// =============================================================== dashboard
interface Dash {
  as_on: string; payable_days: number; unpaid: { cprs: number; amount: number; overdue: number; growers: number };
  aging: { bucket: string; cprs: number; amount: number }[]; by_circle: { circle: string; amount: number }[];
  cess: { month: string; grower: number; mill: number; total: number; deposited: number }[];
  loans: { status: string; n: number; amount: number; outstanding: number; markup: number; recovered: number }[];
  paid: { day: string; amount: number; cprs: number; scrolls: number }[];
  scrolls: { name: string; posting_date: string; status: string; cpr_count: number; grower_count: number; total_amount: number; without_iban: number }[];
  checks: { key: string; label: string; ledger: number; expected: number; ok: boolean; hint: string; difference: number }[];
}

export function AccountsDashboardPage() {
  const { dark } = useTheme();
  const t = useChartTheme(dark);
  const { data } = useQuery({ queryKey: ["sc-acc-dash"], queryFn: () => get<Dash>(`${API}.dashboard`), refetchInterval: 120_000 });
  if (!data) return <div className="grid gap-4 p-6 md:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-40 rounded-2xl" />)}</div>;
  const cessPending = data.cess.reduce((a, c) => a + c.total - c.deposited, 0);
  const loanOut = data.loans.reduce((a, l) => a + (l.outstanding || 0), 0);
  const loanN = data.loans.filter((l) => l.status === "Disbursed").reduce((a, l) => a + l.n, 0);
  const paid = data.paid.reduce((a, p) => a + p.amount, 0);
  return (
    <div className="space-y-5 p-4 sm:p-6">
      <Header title="Cane accounts" sub={`Grower payables, payments, road cess and loans · ageing as on ${dayLabel(data.as_on)}`}>
        <NavBtn to="/accounts/scroll" icon={ScanBarcode}>Payment scroll</NavBtn>
        <NavBtn to="/accounts/cess" icon={Landmark}>Road cess</NavBtn>
        <NavBtn to="/accounts/loans" icon={HandCoins}>Loans</NavBtn>
        <NavBtn to="/accounts/grower" icon={Users}>Grower statement</NavBtn>
      </Header>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        <KpiCard icon={Wallet} label="Payable to growers" value={money(data.unpaid.amount, { compact: true })} color={C.violet} sub={`${num(data.unpaid.cprs)} CPRs · ${num(data.unpaid.growers)} growers`} to="/accounts/scroll" />
        <KpiCard icon={AlertTriangle} label={`Unpaid > ${data.payable_days} days`} value={money(data.unpaid.overdue, { compact: true })} color={data.unpaid.overdue ? C.red : C.slate} sub="overdue to growers" />
        <KpiCard icon={Banknote} label="Paid by scroll" value={money(paid, { compact: true })} color={C.green} sub={`${data.paid.reduce((a, p) => a + p.scrolls, 0)} scrolls`} />
        <KpiCard icon={Landmark} label="Road cess to deposit" value={money(cessPending, { compact: true })} color={C.amber} sub="grower + mill share" to="/accounts/cess" />
        <KpiCard icon={HandCoins} label="Loans outstanding" value={money(loanOut, { compact: true })} color={C.blue} sub={`${loanN} open loans`} to="/accounts/loans" />
        <KpiCard icon={Receipt} label="Loans recovered" value={money(data.loans.reduce((a, l) => a + (l.recovered || 0), 0), { compact: true })} color={C.teal} sub={`markup ${money(data.loans.reduce((a, l) => a + (l.markup || 0), 0))}`} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {data.checks.map((c) => (
          <div key={c.key} className={cn("rounded-2xl border bg-card p-3 shadow-sm", !c.ok && "border-red-500/40")}>
            <div className="flex items-center gap-1.5 text-sm font-semibold">{c.ok ? <CheckCircle2 className="size-4 text-emerald-600" /> : <XCircle className="size-4 text-red-600" />}{c.label}</div>
            <div className="mt-1 text-lg font-bold tabular-nums">{money(c.ledger)}</div>
            <div className="text-[11px] text-muted-foreground">{c.hint}</div>
          </div>
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <ChartCard title="Unpaid to growers by age" sub="Days since the crushing day">
          <ResponsiveContainer>
            <BarChart data={data.aging} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={t.grid} vertical={false} />
              <XAxis dataKey="bucket" tick={{ fill: t.axis, fontSize: 11 }} />
              <YAxis tick={{ fill: t.axis, fontSize: 11 }} width={56} tickFormatter={(v) => money(v, { compact: true }).replace("Rs ", "")} />
              <Tooltip content={<ChartTip fmt={(v) => money(v)} />} />
              <Bar dataKey="amount" name="Unpaid" fill={C.violet} radius={[6, 6, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Paid per day" sub="Payment scrolls">
          <ResponsiveContainer>
            <BarChart data={data.paid.map((p) => ({ ...p, label: dayLabel(p.day) }))} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={t.grid} vertical={false} />
              <XAxis dataKey="label" tick={{ fill: t.axis, fontSize: 11 }} />
              <YAxis tick={{ fill: t.axis, fontSize: 11 }} width={56} tickFormatter={(v) => money(v, { compact: true }).replace("Rs ", "")} />
              <Tooltip content={<ChartTip fmt={(v) => money(v)} />} />
              <Bar dataKey="amount" name="Paid" fill={C.green} radius={[6, 6, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Unpaid by circle" bodyClass="h-auto">
          <DataTable rows={data.by_circle} rowKey={(r) => r.circle} dense cols={[
            { key: "c", label: "Circle", value: (r) => r.circle },
            { key: "a", label: "Unpaid", align: "right", value: (r) => r.amount, render: (r) => money(r.amount), bar: { color: C.violet } },
          ]} />
        </ChartCard>
      </div>
      <ChartCard title="Payment scrolls" bodyClass="h-auto">
        <DataTable rows={data.scrolls} rowKey={(r) => r.name} dense cols={[
          { key: "n", label: "Scroll", value: (r) => r.name, render: (r) => <Link className="font-semibold text-primary hover:underline" to={`/accounts/scroll?name=${r.name}`}>{r.name}</Link> },
          { key: "d", label: "Date", value: (r) => r.posting_date, render: (r) => dayLabel(r.posting_date) },
          { key: "c", label: "CPRs", align: "right", value: (r) => r.cpr_count },
          { key: "g", label: "Growers", align: "right", value: (r) => r.grower_count },
          { key: "a", label: "Amount", align: "right", value: (r) => r.total_amount, render: (r) => money(r.total_amount) },
          { key: "s", label: "Status", value: (r) => r.status, render: (r) => <Badge tone={r.status === "Paid" ? "green" : r.status === "Draft" ? "amber" : "gray"}>{r.status}</Badge> },
        ]} />
      </ChartCard>
    </div>
  );
}

// =============================================================== scroll
interface ScrollDoc {
  name: string; docstatus: number; status: string; posting_date: string; bank_account: string; mode_of_payment: string; reference_no?: string;
  cpr_count: number; grower_count: number; total_amount: number; without_iban: number; loan_deduction?: number; bank_balance?: number; overdraft_by?: string;
  items: { cpr: string; posting_date: string; grower: string; grower_name: string; iban?: string; amount: number; loan_deduction?: number; cpr_value?: number }[];
  payments: { grower: string; grower_name: string; bank_name?: string; iban?: string; cprs: number; amount: number; loan_deduction?: number; payment_entry?: string; stop_requested?: number; stop_reason?: string }[];
}
interface Unpaid { name: string; posting_date: string; grower: string; grower_name: string; circle: string; payable_cpr: number; iban?: string; loan_deduction?: number; cpr_value?: number }
interface Banks { banks: { account: string; account_name: string; balance: number; committed: number; available: number; default: boolean; last_receipt?: string }[];
  unpaid: { n: number; payable: number; loans: number }; total_available: number; can_overdraft: boolean }
interface LoanAdj { cpr: string; posting_date: string; grower: string; grower_name: string; payable_cpr: number; loan_deduction: number; cpr_value: number;
  loans: { loan: string; amount: number; loan_type?: string; outstanding?: number }[] }

/** What the mill's banks hold, what draft scrolls will take, what is left — against what is unpaid to growers. */
function BankBalances({ data, current }: { data?: Banks; current?: ScrollDoc }) {
  if (!data) return <Skeleton className="h-28" />;
  const short = data.unpaid.payable - data.total_available;
  return (
    <section className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center gap-2"><Landmark className="size-4 text-primary" /><h3 className="font-semibold">Bank balances available</h3>
        <span className="text-xs text-muted-foreground">balance in the ledger − draft scrolls not yet paid = available</span>
        <span className={cn("ml-auto rounded-full px-3 py-1 text-xs font-semibold", short > 0 ? "bg-red-500/10 text-red-600" : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300")}>
          Unpaid to growers {money(data.unpaid.payable)} ({num(data.unpaid.n)} CPRs) · {short > 0 ? `short by ${money(short)}` : `covered, ${money(-short)} spare`}</span></div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {data.banks.map((b) => {
          const mine = current && current.docstatus === 0 && current.bank_account === b.account;
          const after = b.available;
          return (
            <div key={b.account} className={cn("rounded-xl border p-3", mine && "border-primary ring-1 ring-primary/40")}>
              <div className="flex items-center gap-2 text-sm font-semibold"><Landmark className="size-4 text-muted-foreground" />{b.account_name}{b.default && <Badge tone="blue">cane</Badge>}{mine && <Badge tone="violet">this scroll</Badge>}</div>
              <div className="mt-2 text-2xl font-black tabular-nums">{money(b.balance)}</div>
              <div className="text-[11px] text-muted-foreground">balance{b.last_receipt ? ` · last funded ${dayLabel(b.last_receipt)}` : ""}</div>
              <div className="mt-2 flex justify-between text-xs"><span className="text-muted-foreground">On draft scrolls</span><span className="tabular-nums">− {money(b.committed)}</span></div>
              <div className="flex justify-between border-t pt-1 text-sm font-bold"><span>Available</span><span className={cn("tabular-nums", after < 0 ? "text-red-600" : "text-emerald-600")}>{money(after)}</span></div>
            </div>
          );
        })}
        <div className="rounded-xl bg-muted/40 p-3 text-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Loans recovered in unpaid CPRs</div>
          <div className="mt-2 text-2xl font-black tabular-nums text-amber-600">{money(data.unpaid.loans)}</div>
          <p className="mt-1 text-[11px] text-muted-foreground">Already deducted from the CPRs at tare — growers are paid the net.</p>
        </div>
      </div>
    </section>
  );
}

function LoanAdjustments({ scroll, upto }: { scroll?: string; upto?: string }) {
  const { data } = useQuery({ queryKey: ["sc-acc-loanadj", scroll, upto], queryFn: () => get<LoanAdj[]>(`${API}.loan_adjustments`, scroll ? { scroll } : upto ? { to_date: upto } : {}) });
  if (!data?.length) return null;
  return (
    <ChartCard title={`Loan adjustments in ${scroll ? "these" : "unpaid"} CPRs (${data.length})`} sub="Each CPR's value, the loan recovered from it at tare, and what the grower is paid" bodyClass="h-auto">
      <DataTable rows={data} rowKey={(r) => r.cpr} dense cols={[
        { key: "c", label: "CPR", value: (r) => r.cpr, render: (r) => <span className="font-mono text-xs">{r.cpr}</span> },
        { key: "d", label: "Day", value: (r) => r.posting_date, render: (r) => dayLabel(r.posting_date) },
        { key: "g", label: "Grower", value: (r) => r.grower_name, render: (r) => <Link className="hover:underline" to={`/accounts/grower?g=${r.grower}`}>{r.grower_name}</Link> },
        { key: "v", label: "CPR value", align: "right", value: (r) => r.cpr_value, render: (r) => money(r.cpr_value) },
        { key: "l", label: "Loan recovered", align: "right", value: (r) => r.loan_deduction, render: (r) => <span className="font-semibold text-amber-600">− {money(r.loan_deduction)}</span> },
        { key: "p", label: "Paid to grower", align: "right", value: (r) => r.payable_cpr, render: (r) => <b>{money(r.payable_cpr)}</b> },
        { key: "ln", label: "Loans", value: (r) => r.loans.map((l) => l.loan).join(" "), render: (r) => <span className="text-xs">{r.loans.map((l) => <Link key={l.loan} to={`/accounts/loans?loan=${l.loan}`} className="mr-2 font-mono text-primary hover:underline">{l.loan} {l.loan_type ? `· ${l.loan_type}` : ""} ({money(l.amount)})</Link>)}</span> },
      ]} />
    </ChartCard>
  );
}

/** Download a bank document; every one is also kept in the document vault. */
const dl = (method: string, args: Record<string, string>, fname: string) => postDownload(`${API}.${method}`, args, fname).catch((e) => toast.error(err(e)));

export function ScrollPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const name = params.get("name") ?? "";
  const { data: doc, refetch } = useQuery({ queryKey: ["sc-acc-scroll", name], enabled: !!name, queryFn: () => get<ScrollDoc>(`${API}.scroll`, { name }) });
  const [upto, setUpto] = useState("");
  const { data: unpaid } = useQuery({ queryKey: ["sc-acc-unpaid", upto], queryFn: () => get<Unpaid[]>(`${API}.unpaid`, upto ? { to_date: upto } : {}) });
  const [scan, setScan] = useState("");
  const [busy, setBusy] = useState(false);
  const { data: banks, refetch: reBanks } = useQuery({ queryKey: ["sc-acc-banks", doc?.total_amount, doc?.bank_account, doc?.docstatus], queryFn: () => get<Banks>(`${API}.bank_balances`) });
  const box = useRef<HTMLInputElement>(null);
  useEffect(() => box.current?.focus(), [doc?.cpr_count]);
  const run = async (fn: () => Promise<unknown>) => { setBusy(true); try { await fn(); } catch (e) { toast.error(err(e)); } finally { setBusy(false); } };
  const start = (cprs: string[]) => run(async () => {
    const d = await post<ScrollDoc>(`${API}.save_scroll`, { posting_date: today(), mode_of_payment: "Bank Transfer", cprs });
    navigate(`/accounts/scroll?name=${d.name}`);
  });
  const draft = doc && doc.docstatus === 0;
  return (
    <div className="space-y-5 p-4 sm:p-6">
      <Header title={doc ? `Payment scroll ${doc.name}` : "Payment scroll"} sub="Scan the CPR barcodes (or a grower ID / CNIC for all their unpaid CPRs); on Pay, one bank payment per grower is posted against their CPRs">
        {doc && <Badge tone={doc.status === "Paid" ? "green" : "amber"}>{doc.status}</Badge>}
        {doc && <Button variant="outline" onClick={() => dl("bank_file", { name: doc.name }, `${doc.name}.csv`)}><Download />Bank file (CSV)</Button>}
        {doc && <Button variant="outline" onClick={() => dl("payment_schedule", { name: doc.name }, `Payment schedule ${doc.name}.pdf`)}><FileText />Payment schedule</Button>}
        {doc && <Button variant="outline" onClick={() => dl("instruction_letters", { name: doc.name }, `Bank instructions ${doc.name}.pdf`)}><Landmark />Instruction letters (by bank)</Button>}
        {draft && (() => {
          const b = banks?.banks.find((x) => x.account === doc.bank_account);
          const room = b ? b.available + doc.total_amount : 0;  // balance less the OTHER draft scrolls on this bank
          const over = !!b && doc.total_amount > room + 0.01;
          return <Button disabled={busy || !doc.cpr_count || (over && !banks?.can_overdraft)} title={over ? `${doc.bank_account} holds ${money(b!.balance)}` : ""}
            onClick={() => {
              const msg = over ? `${doc.bank_account} has only ${money(room)} free. Pay ${money(doc.total_amount)} OVER the bank balance?` : `Pay ${money(doc.total_amount)} to ${doc.grower_count} growers from ${doc.bank_account}?`;
              if (window.confirm(msg)) run(async () => { await post(`${API}.pay_scroll`, { name: doc.name, overdraft: over ? 1 : 0 }); toast.success("Paid"); refetch(); reBanks(); qc.invalidateQueries({ queryKey: ["sc-acc-unpaid"] }); });
            }}><Banknote />Pay {money(doc.total_amount)}</Button>;
        })()}
      </Header>
      <BankBalances data={banks} current={doc} />
      {doc ? (
        <>
          {draft && (() => {
            const b = banks?.banks.find((x) => x.account === doc.bank_account);
            const room = b ? b.available + doc.total_amount : 0;
            return (
              <div className={cn("flex flex-wrap items-center gap-3 rounded-xl border p-3 text-sm", b && doc.total_amount > room ? "border-red-500/50 bg-red-500/5" : "border-emerald-500/40 bg-emerald-500/5")}>
                <Landmark className="size-4" />Pay from
                <select value={doc.bank_account} onChange={(e) => run(async () => { await post(`${API}.save_scroll`, { name: doc.name, bank_account: e.target.value }); refetch(); })}
                  className="h-9 rounded-lg border bg-background px-2 text-sm">{(banks?.banks ?? []).map((x) => <option key={x.account} value={x.account}>{x.account} — {money(x.balance)}</option>)}</select>
                {b && <span>Balance <b>{money(b.balance)}</b>{b.committed - doc.total_amount > 0.5 ? <> − other draft scrolls <b>{money(b.committed - doc.total_amount)}</b></> : null} − this scroll <b>{money(doc.total_amount)}</b> = <b className={room - doc.total_amount < 0 ? "text-red-600" : "text-emerald-600"}>{money(room - doc.total_amount)}</b> left</span>}
                {b && doc.total_amount > room && <span className="font-semibold text-red-600">Not enough in this bank — choose another, take CPRs off, or fund it.</span>}
              </div>
            );
          })()}
          {doc.docstatus === 1 && <div className="text-sm text-muted-foreground">Paid from <b>{doc.bank_account}</b>{doc.bank_balance ? <> · balance then {money(doc.bank_balance)}</> : null}{doc.overdraft_by ? <span className="text-red-600"> · paid over the balance by {doc.overdraft_by}</span> : null}</div>}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <KpiCard icon={Receipt} label="CPRs" value={num(doc.cpr_count)} color={C.violet} />
            <KpiCard icon={HandCoins} label="Loans recovered" value={money(doc.loan_deduction ?? 0)} color={C.amber} sub="already cut from these CPRs" />
            <KpiCard icon={Users} label="Growers (payments)" value={num(doc.grower_count)} color={C.blue} sub={doc.without_iban ? `${doc.without_iban} without IBAN` : "all with IBAN"} />
            <KpiCard icon={Banknote} label="Total" value={money(doc.total_amount)} color={C.green} />
            <div className="rounded-2xl border bg-card p-4 shadow-sm">
              <label className="block text-xs text-muted-foreground">Date<Input type="date" disabled={!draft} defaultValue={doc.posting_date} onBlur={(e) => draft && run(async () => { await post(`${API}.save_scroll`, { name: doc.name, posting_date: e.target.value }); refetch(); })} className="mt-1" /></label>
              <label className="mt-2 block text-xs text-muted-foreground">Mode
                <select disabled={!draft} value={doc.mode_of_payment} onChange={(e) => run(async () => { await post(`${API}.save_scroll`, { name: doc.name, mode_of_payment: e.target.value }); refetch(); })} className="mt-1 h-9 w-full rounded-lg border bg-background px-2 text-sm">
                  <option>Bank Transfer</option><option>Cheque</option></select></label>
              <label className="mt-2 block text-xs text-muted-foreground">Bank reference / cheque no.<Input disabled={!draft} defaultValue={doc.reference_no ?? ""} onBlur={(e) => draft && run(async () => { await post(`${API}.save_scroll`, { name: doc.name, reference_no: e.target.value }); refetch(); })} className="mt-1" /></label>
            </div>
          </div>
          {draft && (
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (scan.trim()) run(async () => { await post(`${API}.add_to_scroll`, { name: doc.name, q: scan.trim() }); setScan(""); refetch(); }); }}>
              <div className="relative flex-1"><ScanBarcode className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
                <Input ref={box} value={scan} onChange={(e) => setScan(e.target.value.toUpperCase())} placeholder="Scan a CPR barcode, or a grower ID / CNIC" className="h-12 pl-10 font-mono text-lg" /></div>
              <Button type="submit" className="h-12" disabled={busy}><Plus />Add</Button>
            </form>
          )}
          {doc.without_iban > 0 && doc.mode_of_payment !== "Cheque" && <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">{doc.without_iban} grower(s) have no IBAN — add their bank details, take them off, or pay this scroll by cheque.</div>}
          <div className="grid gap-4 xl:grid-cols-2">
            <ChartCard title="Payments (one per grower)" bodyClass="h-auto">
              <DataTable rows={doc.payments} rowKey={(r) => r.grower} dense cols={[
                { key: "g", label: "Grower", value: (r) => r.grower_name, render: (r) => <Link className="hover:underline" to={`/accounts/grower?g=${r.grower}`}>{r.grower_name}</Link> },
                { key: "b", label: "Bank · IBAN", value: (r) => r.iban ?? "", render: (r) => (r.iban ? <span className="font-mono text-[11px]">{r.bank_name} · {r.iban}</span> : <Badge tone="red">no IBAN</Badge>) },
                { key: "c", label: "CPRs", align: "right", value: (r) => r.cprs },
                { key: "l", label: "Loan cut", align: "right", value: (r) => r.loan_deduction ?? 0, render: (r) => r.loan_deduction ? <span className="text-amber-600">− {money(r.loan_deduction)}</span> : "" },
                { key: "a", label: "Amount", align: "right", value: (r) => r.amount, render: (r) => <b>{money(r.amount)}</b> },
                { key: "p", label: "Payment", value: (r) => r.payment_entry ?? "", render: (r) => (
                  <span className="flex items-center gap-2"><span className="font-mono text-[11px]">{r.payment_entry ?? "—"}</span>
                    {r.stop_requested ? <Badge tone="red">stop requested</Badge> : doc.docstatus === 1 && (
                      <button type="button" className="text-[11px] font-semibold text-red-600 hover:underline" onClick={() => {
                        const reason = window.prompt(`Stop the payment of ${money(r.amount)} to ${r.grower_name}? Reason:`);
                        if (reason) dl("stop_payment", { name: doc.name, grower: r.grower, reason }, `Stop payment ${doc.name} ${r.grower}.pdf`).then(() => refetch());
                      }}>stop payment</button>)}
                    {r.stop_requested ? <button type="button" className="text-[11px] text-muted-foreground hover:underline" onClick={() => dl("stop_payment", { name: doc.name, grower: r.grower, reason: r.stop_reason ?? "" }, `Stop payment ${doc.name} ${r.grower}.pdf`)}>letter</button> : null}
                  </span>) },
              ]} />
            </ChartCard>
            <ChartCard title="CPRs" bodyClass="h-auto">
              <DataTable rows={doc.items} rowKey={(r) => r.cpr} dense cols={[
                { key: "c", label: "CPR", value: (r) => r.cpr, render: (r) => <span className="font-mono text-xs">{r.cpr}</span> },
                { key: "d", label: "Day", value: (r) => r.posting_date, render: (r) => dayLabel(r.posting_date) },
                { key: "g", label: "Grower", value: (r) => r.grower_name },
                { key: "l", label: "Loan cut", align: "right", value: (r) => r.loan_deduction ?? 0, render: (r) => r.loan_deduction ? <span className="text-amber-600">− {money(r.loan_deduction)}</span> : "" },
                { key: "a", label: "Amount", align: "right", value: (r) => r.amount, render: (r) => money(r.amount) },
                { key: "x", label: "", value: () => "", render: (r) => draft ? <button type="button" className="text-xs text-red-600 hover:underline" onClick={() => run(async () => { await post(`${API}.save_scroll`, { name: doc.name, cprs: doc.items.filter((i) => i.cpr !== r.cpr).map((i) => i.cpr) }); refetch(); })}>remove</button> : null },
              ]} />
            </ChartCard>
          </div>
          <LoanAdjustments scroll={doc.name} />
        </>
      ) : (<>
        <ChartCard title={`Unpaid CPRs (${unpaid?.length ?? 0})`} sub="Start a scroll with all of them, or open one and scan" bodyClass="h-auto"
          actions={<div className="flex items-center gap-2"><span className="text-xs text-muted-foreground">up to</span><input type="date" value={upto} onChange={(e) => setUpto(e.target.value)} className="h-8 rounded-lg border bg-background px-2 text-sm" />
            <Button size="sm" disabled={busy || !unpaid?.length} onClick={() => start((unpaid ?? []).filter((r) => r.iban).map((r) => r.name))}><Plus />Scroll for those with an IBAN</Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => start([])}>Empty scroll (scan)</Button>
            <Button size="sm" variant="outline" onClick={() => dl("unpaid_scroll", upto ? { to_date: upto } : {}, "Unpaid CPR scroll.pdf")}><FileText />Bank scroll (PDF)</Button></div>}>
          <DataTable rows={unpaid ?? []} rowKey={(r) => r.name} dense cols={[
            { key: "c", label: "CPR", value: (r) => r.name, render: (r) => <span className="font-mono text-xs">{r.name}</span> },
            { key: "d", label: "Day", value: (r) => r.posting_date, render: (r) => dayLabel(r.posting_date) },
            { key: "g", label: "Grower", value: (r) => r.grower_name },
            { key: "ci", label: "Circle", value: (r) => r.circle },
            { key: "i", label: "IBAN", value: (r) => (r.iban ? 1 : 0), render: (r) => (r.iban ? <CheckCircle2 className="size-4 text-emerald-600" /> : <Badge tone="red">none</Badge>) },
            { key: "l", label: "Loan cut", align: "right", value: (r) => r.loan_deduction ?? 0, render: (r) => r.loan_deduction ? <span className="text-amber-600">− {money(r.loan_deduction)}</span> : "" },
            { key: "a", label: "Payable", align: "right", value: (r) => r.payable_cpr, render: (r) => money(r.payable_cpr) },
          ]} />
        </ChartCard>
        <LoanAdjustments upto={upto} />
      </>)}
    </div>
  );
}

// =============================================================== cess
interface CessData { pending: { month: string; first: string; last: string; cprs: number; grower: number; mill: number; total: number }[]; deposits: { name: string; from_date: string; to_date: string; deposit_date: string; challan_no: string; cpr_count: number; total_amount: number; docstatus: number; journal_entry?: string }[] }

export function CessPage() {
  const { data, refetch } = useQuery({ queryKey: ["sc-acc-cess"], queryFn: () => get<CessData>(`${API}.cess`) });
  const [f, setF] = useState({ from_date: "", to_date: "", deposit_date: today(), challan_no: "" });
  const [busy, setBusy] = useState(false);
  return (
    <div className="space-y-5 p-4 sm:p-6">
      <Header title="Road cess" sub="Cess deducted from growers (their share) and borne by the mill is deposited with the government in full; each deposit marks its CPRs" />
      <ChartCard title="To deposit" bodyClass="h-auto">
        <DataTable rows={data?.pending ?? []} rowKey={(r) => r.month} dense cols={[
          { key: "m", label: "Month", value: (r) => r.month, render: (r) => <b>{r.month}</b> },
          { key: "p", label: "CPRs from – to", value: (r) => r.first, render: (r) => `${dayLabel(r.first)} – ${dayLabel(r.last)}` },
          { key: "n", label: "CPRs", align: "right", value: (r) => r.cprs },
          { key: "g", label: "Grower share", align: "right", value: (r) => r.grower, render: (r) => money(r.grower) },
          { key: "mi", label: "Mill share", align: "right", value: (r) => r.mill, render: (r) => money(r.mill) },
          { key: "t", label: "Total", align: "right", value: (r) => r.total, render: (r) => <b>{money(r.total)}</b> },
          { key: "u", label: "", value: () => "", render: (r) => <Button size="sm" variant="outline" onClick={() => setF({ ...f, from_date: r.first, to_date: r.last })}>Deposit this</Button> },
        ]} />
      </ChartCard>
      <section className="rounded-2xl border bg-card p-4 shadow-sm">
        <h3 className="mb-3 font-semibold">Record a deposit</h3>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {([["from_date", "CPRs from", "date"], ["to_date", "CPRs to", "date"], ["deposit_date", "Deposited on", "date"], ["challan_no", "Challan no.", "text"]] as const).map(([k, l, ty]) => (
            <label key={k} className="text-xs text-muted-foreground">{l}<Input type={ty} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} className="mt-1" /></label>
          ))}
          <Button className="self-end" disabled={busy || !f.from_date || !f.to_date || !f.challan_no} onClick={async () => {
            setBusy(true);
            try { const d = await post<{ name: string; total_amount: number; cpr_count: number }>(`${API}.deposit_cess`, f); toast.success(`${d.name}: ${money(d.total_amount)} for ${d.cpr_count} CPRs`); setF({ ...f, challan_no: "" }); refetch(); } catch (e) { toast.error(err(e)); } finally { setBusy(false); }
          }}><Landmark />Deposit</Button>
        </div>
      </section>
      <ChartCard title="Deposits" bodyClass="h-auto">
        <DataTable rows={data?.deposits ?? []} rowKey={(r) => r.name} dense cols={[
          { key: "n", label: "Deposit", value: (r) => r.name, render: (r) => <Link className="font-mono text-xs text-primary hover:underline" to={`/accounts/d/road-cess-deposit/${r.name}`}>{r.name}</Link> },
          { key: "c", label: "Challan", value: (r) => r.challan_no },
          { key: "d", label: "Deposited", value: (r) => r.deposit_date, render: (r) => dayLabel(r.deposit_date) },
          { key: "p", label: "CPRs", value: (r) => r.from_date, render: (r) => `${dayLabel(r.from_date)} – ${dayLabel(r.to_date)} (${r.cpr_count})` },
          { key: "a", label: "Amount", align: "right", value: (r) => r.total_amount, render: (r) => <b>{money(r.total_amount)}</b> },
          { key: "j", label: "Journal", value: (r) => r.journal_entry ?? "", render: (r) => <span className="font-mono text-[11px]">{r.journal_entry}</span> },
        ]} />
      </ChartCard>
    </div>
  );
}

// =============================================================== loans
interface LoanRow { verification_status?: string; requested_amount?: number; eligible_amount?: number; guarantor?: string; name: string; grower: string; grower_name: string; circle: string; loan_type: string; status: string; docstatus: number; application_date: string; amount: number; markup_pct: number; recovery_pct: number; disbursed_on?: string; markup_accrued: number; recovered: number; outstanding: number; guarantor_name?: string; surveyed_acres: number }
interface LoanTypes { name: string; purpose: string; markup_pct: number; recovery_pct: number; max_amount: number; max_per_acre: number }
interface LoanDetail extends LoanRow, Omit<LoanSurvey, keyof LoanRow> { entries: { entry_type: string; posting_date: string; amount: number; cpr?: string; journal_entry?: string; period?: string; remarks?: string }[] }

interface Eligibility { acres: number; expected_maund: number; expected_value: number; cap: number; taken: number; open_outstanding: number; eligible: number;
  limits: { label: string; amount: number }[]; checks: { label: string; ok: boolean; detail: string }[];
  history: { name: string; season: string; loan_type: string; amount: number; recovered: number; outstanding: number; status: string }[];
  guarantor?: { outstanding: number; guaranteeing: number; acres: number } | null }

function EligibilityBox({ el }: { el: Eligibility }) {
  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <div className="rounded-xl border p-3 text-sm">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Eligibility</p>
        {el.limits.map((l) => <div key={l.label} className="flex justify-between gap-2 border-b border-dashed py-1"><span className="text-muted-foreground">{l.label}</span><span className="tabular-nums">{money(l.amount)}</span></div>)}
        <div className="flex justify-between py-1"><span className="text-muted-foreground">less taken / outstanding</span><span className="tabular-nums">− {money(el.taken + el.open_outstanding)}</span></div>
        <div className="flex justify-between border-t pt-1 font-bold"><span>Eligible</span><span className="tabular-nums text-emerald-600">{money(el.eligible)}</span></div>
      </div>
      <div className="rounded-xl border p-3 text-sm">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Checks</p>
        {el.checks.map((c) => <div key={c.label} className="flex items-start gap-1.5 py-0.5">{c.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" /> : <XCircle className="mt-0.5 size-4 shrink-0 text-red-600" />}<span>{c.label}{c.detail && <span className="text-xs text-muted-foreground"> · {c.detail}</span>}</span></div>)}
        {el.guarantor && <p className="mt-1 text-xs text-muted-foreground">Guarantor: owes {money(el.guarantor.outstanding)}, guarantees {el.guarantor.guaranteeing} other loan(s)</p>}
      </div>
      <div className="rounded-xl border p-3 text-sm">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Previous loans</p>
        {el.history.length ? el.history.map((h) => <div key={h.name} className="flex justify-between gap-2 py-0.5"><span className="font-mono text-xs">{h.name} · {h.season} · {h.loan_type}</span><span className="text-xs">{money(h.amount)} → <b>{money(h.outstanding)}</b> <Badge tone={LOAN_TONE[h.status]}>{h.status}</Badge></span></div>)
          : <p className="text-muted-foreground">None</p>}
        <p className="mt-1 text-xs text-muted-foreground">{el.acres} acres surveyed · {num(el.expected_maund)} md expected ({money(el.expected_value, { compact: true })})</p>
      </div>
    </div>
  );
}

function LoanPanel({ name, canDisburse, canApprove, onChange }: { name: string; canDisburse: boolean; canApprove: boolean; onChange: () => void }) {
  const { data, refetch } = useQuery({ queryKey: ["sc-acc-loan", name], queryFn: () => get<LoanDetail>(`${API}.loan`, { name }) });
  const { data: el } = useQuery({ queryKey: ["sc-acc-elig", name, data?.status], enabled: !!data, queryFn: () => get<Eligibility>(`${API}.loan_eligibility`, { grower: data!.grower, loan_type: data!.loan_type, guarantor: data!.guarantor ?? "", name }) });
  const [approve, setApprove] = useState("");
  const [amt, setAmt] = useState("");
  const act = async (method: string, args: Record<string, string>, ok: string) => { try { await post(`${API}.${method}`, { name, ...args }); toast.success(ok); refetch(); onChange(); } catch (e) { toast.error(err(e)); } };
  if (!data) return <Skeleton className="h-40" />;
  return (
    <section className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold">{data.name} · {data.grower_name}</h3><Badge tone={LOAN_TONE[data.status]}>{data.status}</Badge>
        <span className="text-sm text-muted-foreground">{data.loan_type} · {data.markup_pct}% a year · {data.recovery_pct}% of each CPR</span>
        <span className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" onClick={() => dl("loan_application", { name }, `Loan application ${name}.pdf`)}><FileText />Application (PDF)</Button>
          {data.status === "Draft" && canApprove && <><Input value={approve} onChange={(e) => setApprove(e.target.value)} placeholder={`approve ${num(data.recommended_amount || data.amount)}`} className="h-8 w-32" />
            <Button size="sm" disabled={data.verification_status === "Pending" || data.recommendation === "Do not recommend"}
              title={data.verification_status === "Pending" ? "Waiting for the field survey" : ""}
              onClick={async () => { try { const amt = approve || (data.recommended_amount && data.recommended_amount < data.amount ? String(data.recommended_amount) : ""); if (amt) await post(`${API}.save_loan`, { name, approved_amount: amt, grower: data.grower, loan_type: data.loan_type, amount: amt }); await act("approve_loan", {}, "Approved"); } catch (e) { toast.error(err(e)); } }}><CheckCircle2 />Approve</Button>
            <Button size="sm" variant="outline" onClick={() => { const r = window.prompt("Reject this loan request — reason:"); if (r) act("reject_loan", { reason: r }, "Rejected"); }}><XCircle />Reject</Button></>}
          {data.status === "Approved" && canDisburse && <Button size="sm" onClick={() => act("disburse", { on: today() }, "Disbursed")}><Banknote />Disburse {money(data.amount)}</Button>}
          {data.status === "Disbursed" && canDisburse && <><Input value={amt} onChange={(e) => setAmt(e.target.value)} placeholder="Amount" className="h-8 w-28" /><Button size="sm" variant="outline" disabled={!amt} onClick={() => act("repay", { amount: amt }, "Repayment recorded")}><HandCoins />Repay</Button></>}
        </span>
      </div>
      <div className="mt-3"><LoanSteps l={data} /></div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {([["Applied for", data.requested_amount ?? data.amount], ["Eligible", data.eligible_amount ?? 0], [data.docstatus ? "Approved" : "To approve", data.amount], ["Markup", data.markup_accrued], ["Recovered", data.recovered], ["Outstanding", data.outstanding]] as const).map(([l, v]) => (
          <div key={l} className="rounded-xl bg-muted/40 p-2 text-center"><div className="text-lg font-bold tabular-nums">{money(v)}</div><div className="text-[11px] text-muted-foreground">{l}</div></div>
        ))}
        <div className="rounded-xl bg-muted/40 p-2 text-center"><div className="text-lg font-bold tabular-nums">{data.surveyed_acres}</div><div className="text-[11px] text-muted-foreground">surveyed acres</div></div>
      </div>
      <div className="mt-3"><VerificationCard l={data} canAssign={canApprove || canDisburse} onChange={() => { refetch(); onChange(); }} /></div>
      {el && <div className="mt-3"><EligibilityBox el={el} /></div>}
      <div className="mt-3"><GrowerHistory grower={data.grower} /></div>
      <div className="mt-3">
        <DataTable rows={data.entries} rowKey={(r) => `${r.entry_type}-${r.posting_date}-${r.cpr ?? r.period ?? r.amount}`} dense cols={[
          { key: "d", label: "Date", value: (r) => r.posting_date, render: (r) => dayLabel(r.posting_date) },
          { key: "t", label: "Entry", value: (r) => r.entry_type, render: (r) => <Badge tone={r.entry_type === "Markup" ? "amber" : r.entry_type === "Write-off" ? "red" : "green"}>{r.entry_type}</Badge> },
          { key: "a", label: "Amount", align: "right", value: (r) => r.amount, render: (r) => money(r.amount) },
          { key: "c", label: "CPR / period", value: (r) => r.cpr ?? r.period ?? "", render: (r) => <span className="font-mono text-xs">{r.cpr ?? r.period ?? ""}</span> },
          { key: "r", label: "Remarks", value: (r) => r.remarks ?? "" },
        ]} />
      </div>
    </section>
  );
}

export function LoansPage() {
  const [status, setStatus] = useState("");
  const [lp] = useSearchParams();
  const [open, setOpen] = useState(lp.get("loan") ?? "");
  const { data, refetch } = useQuery({ queryKey: ["sc-acc-loans", status], queryFn: () => get<{ rows: LoanRow[]; types: LoanTypes[]; can_approve: boolean; can_disburse: boolean }>(`${API}.loans`, { status }) });
  const [f, setF] = useState({ grower: "", loan_type: "", amount: "", guarantor: "" });
  const [month, setMonth] = useState("");
  const { data: pre } = useQuery({ queryKey: ["sc-acc-elig-new", f.grower, f.loan_type, f.guarantor], enabled: f.grower.length >= 10 && !!f.loan_type, retry: false,
    queryFn: () => get<Eligibility>(`${API}.loan_eligibility`, { grower: f.grower, loan_type: f.loan_type, guarantor: f.guarantor }) });
  return (
    <div className="space-y-5 p-4 sm:p-6">
      <Header title="Grower loans" sub="Requested → field survey → approved by the Cane Manager → disbursed by bank; recovered from each CPR (the type's share of its net after TPT); markup accrued monthly">
        <Link to="/accounts/loan-surveys" className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium hover:bg-muted"><ClipboardCheck className="size-4" />Loan field surveys</Link>
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="h-9 rounded-lg border bg-background px-2 text-sm" />
        <Button variant="outline" disabled={!month} onClick={async () => { try { const r = await post<{ loans: number; amount: number }>(`${API}.markup`, { month }); toast.success(`Markup ${money(r.amount)} on ${r.loans} loans`); refetch(); } catch (e) { toast.error(err(e)); } }}>Accrue markup</Button>
      </Header>
      <section className="rounded-2xl border bg-card p-4 shadow-sm">
        <h3 className="mb-3 font-semibold">New loan application</h3>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <Input value={f.grower} onChange={(e) => setF({ ...f, grower: e.target.value })} placeholder="Grower ID (001-001-0001)" className="font-mono" />
          <select value={f.loan_type} onChange={(e) => setF({ ...f, loan_type: e.target.value })} className="h-9 rounded-lg border bg-background px-2 text-sm">
            <option value="">Loan type</option>{data?.types.map((t) => <option key={t.name} value={t.name}>{t.name} · {t.markup_pct}% · max {num(t.max_amount)}{t.max_per_acre ? ` / ${num(t.max_per_acre)} per acre` : ""}</option>)}</select>
          <Input value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} placeholder="Amount" inputMode="decimal" />
          <Input value={f.guarantor} onChange={(e) => setF({ ...f, guarantor: e.target.value })} placeholder="Guarantor grower ID (optional)" className="font-mono" />
          <Button disabled={!f.grower || !f.loan_type || !f.amount || (!!pre && Number(f.amount) > pre.eligible)} onClick={async () => { try { const d = await post<{ name: string }>(`${API}.save_loan`, f); toast.success(`${d.name} applied`); setOpen(d.name); setF({ grower: "", loan_type: "", amount: "", guarantor: "" }); refetch(); } catch (e) { toast.error(err(e)); } }}><Plus />Apply</Button>
        </div>
        {f.grower.length >= 10 && <div className="mt-3"><GrowerHistory grower={f.grower} /></div>}
        {pre && <div className="mt-3"><EligibilityBox el={pre} />{Number(f.amount) > pre.eligible && <p className="mt-2 text-sm font-semibold text-red-600">More than the eligible {money(pre.eligible)}</p>}</div>}
      </section>
      {open && <LoanPanel key={open} name={open} canApprove={!!data?.can_approve} canDisburse={!!data?.can_disburse} onChange={() => refetch()} />}
      <div className="flex flex-wrap gap-2">
        {["", "Draft", "Approved", "Disbursed", "Recovered", "Rejected", "Written Off"].map((s) => (
          <button key={s} type="button" onClick={() => setStatus(s)} className={cn("rounded-full border px-3 py-1 text-xs font-medium", status === s ? "border-primary/40 bg-primary/10 text-primary" : "text-muted-foreground")}>{s || "All"}</button>
        ))}
      </div>
      <ChartCard title="Loans" bodyClass="h-auto">
        <DataTable rows={data?.rows ?? []} rowKey={(r) => r.name} dense cols={[
          { key: "n", label: "Loan", value: (r) => r.name, render: (r) => <button type="button" onClick={() => setOpen(r.name)} className="font-mono text-xs font-semibold text-primary hover:underline">{r.name}</button> },
          { key: "g", label: "Grower", value: (r) => r.grower_name, render: (r) => <Link className="hover:underline" to={`/accounts/grower?g=${r.grower}`}>{r.grower_name}</Link> },
          { key: "c", label: "Circle", value: (r) => r.circle },
          { key: "t", label: "Type", value: (r) => r.loan_type },
          { key: "a", label: "Loan", align: "right", value: (r) => r.amount, render: (r) => money(r.amount) },
          { key: "m", label: "Markup", align: "right", value: (r) => r.markup_accrued, render: (r) => money(r.markup_accrued) },
          { key: "r", label: "Recovered", align: "right", value: (r) => r.recovered, render: (r) => money(r.recovered) },
          { key: "o", label: "Outstanding", align: "right", value: (r) => r.outstanding, render: (r) => <b>{money(r.outstanding)}</b>, bar: { color: C.blue } },
          { key: "s", label: "Status", value: (r) => r.status, render: (r) => <><Badge tone={LOAN_TONE[r.status]}>{r.status}</Badge>
            {r.status === "Draft" && r.verification_status && r.verification_status !== "Not needed" && <Badge tone={r.verification_status === "Verified" ? "green" : "amber"} className="ml-1">survey {r.verification_status.toLowerCase()}</Badge>}</> },
        ]} />
      </ChartCard>
    </div>
  );
}

// =============================================================== grower statement
interface Statement {
  grower: { name: string; grower_name: string; father_name?: string; cnic?: string; circle?: string; village_name?: string; iban?: string; bank_name?: string };
  opening: number; payable: number; loan_outstanding: number;
  rows: { posting_date: string; voucher_type: string; voucher_no: string; kind: string; debit: number; credit: number; balance: number; remarks?: string }[];
  cprs: { name: string; posting_date: string; payable_maund: number; net_amount: number; tpt_amount: number; loan_deduction: number; payable_cpr: number; payment_status: string; payment_scroll?: string; paid_on?: string }[];
  loans: LoanRow[];
}

export function StatementPage() {
  const [params, setParams] = useSearchParams();
  const g = params.get("g") ?? "";
  const [q, setQ] = useState(g);
  const { data, isFetching, error } = useQuery({ queryKey: ["sc-acc-stmt", g], enabled: !!g, queryFn: () => get<Statement>(`${API}.statement`, { grower: g }), retry: false });
  return (
    <div className="space-y-5 p-4 sm:p-6">
      <Header title="Grower statement" sub="Everything posted against a grower: CPRs, bank payments, loans, markup and recoveries">
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (q.trim()) setParams({ g: q.trim() }); }}>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Grower ID" className="w-48 font-mono" /><Button type="submit"><Search />Show</Button>
        </form>
        {g && <Link to={`/reports?r=${encodeURIComponent("Grower Ledger")}`} className="inline-flex h-9 items-center gap-2 rounded-lg border bg-card px-3 text-sm font-semibold hover:bg-accent"><FileText className="size-4" />Ledger report</Link>}
      </Header>
      {isFetching && <Skeleton className="h-64 rounded-2xl" />}
      {error && <p className="text-sm text-red-600">{err(error)}</p>}
      {data && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border bg-card p-4 shadow-sm"><div className="text-lg font-bold">{data.grower.grower_name}</div>
              <div className="text-xs text-muted-foreground">{data.grower.father_name ? `s/o ${data.grower.father_name} · ` : ""}{data.grower.name} · {data.grower.cnic}</div>
              <div className="text-xs text-muted-foreground">{data.grower.village_name} · {data.grower.circle}</div>
              <div className="mt-1 font-mono text-[11px]">{data.grower.iban ? `${data.grower.bank_name} · ${data.grower.iban}` : "no IBAN"}</div></div>
            <KpiCard icon={Wallet} label="Payable to the grower" value={money(data.payable)} color={C.violet} sub={`${data.cprs.filter((c) => c.payment_status === "Unpaid").length} unpaid CPRs`} />
            <KpiCard icon={HandCoins} label="Loan outstanding" value={money(data.loan_outstanding)} color={C.blue} sub={`${data.loans.length} loans`} />
            <KpiCard icon={Receipt} label="Cane sold" value={`${num(data.cprs.reduce((a, c) => a + c.payable_maund, 0))} md`} color={C.green} sub={`${data.cprs.length} CPRs · loans recovered ${money(data.cprs.reduce((a, c) => a + c.loan_deduction, 0))}`} />
          </div>
          <ChartCard title="Ledger" sub="Credit = owed to the grower; loan entries are debits" bodyClass="h-auto">
            <DataTable rows={data.rows} rowKey={(r) => `${r.voucher_no}-${r.kind}-${r.debit}-${r.credit}`} dense cols={[
              { key: "d", label: "Date", value: (r) => r.posting_date, render: (r) => dayLabel(r.posting_date) },
              { key: "k", label: "Ledger", value: (r) => r.kind, render: (r) => <Badge tone={r.kind === "Loan" ? "blue" : "violet"}>{r.kind}</Badge> },
              { key: "v", label: "Voucher", value: (r) => r.voucher_no, render: (r) => <span className="font-mono text-[11px]">{r.voucher_type} {r.voucher_no}</span> },
              { key: "dr", label: "Debit", align: "right", value: (r) => r.debit, render: (r) => (r.debit ? money(r.debit) : "") },
              { key: "cr", label: "Credit", align: "right", value: (r) => r.credit, render: (r) => (r.credit ? money(r.credit) : "") },
              { key: "b", label: "Balance", align: "right", value: (r) => r.balance, render: (r) => <b>{money(r.balance)}</b> },
              { key: "r", label: "Remarks", value: (r) => r.remarks ?? "", render: (r) => <span className="text-xs text-muted-foreground">{(r.remarks ?? "").slice(0, 90)}</span> },
            ]} />
          </ChartCard>
          <ChartCard title="CPRs" bodyClass="h-auto">
            <DataTable rows={data.cprs} rowKey={(r) => r.name} dense cols={[
              { key: "n", label: "CPR", value: (r) => r.name, render: (r) => <Link className="font-mono text-xs text-primary hover:underline" to={`/procurement/d/cane-purchase-receipt/${r.name}`}>{r.name}</Link> },
              { key: "d", label: "Day", value: (r) => r.posting_date, render: (r) => dayLabel(r.posting_date) },
              { key: "m", label: "Maund", align: "right", value: (r) => r.payable_maund, render: (r) => num(r.payable_maund) },
              { key: "net", label: "Net", align: "right", value: (r) => r.net_amount, render: (r) => money(r.net_amount) },
              { key: "t", label: "TPT", align: "right", value: (r) => r.tpt_amount, render: (r) => money(r.tpt_amount) },
              { key: "l", label: "Loan", align: "right", value: (r) => r.loan_deduction, render: (r) => (r.loan_deduction ? money(r.loan_deduction) : "—") },
              { key: "p", label: "Payable", align: "right", value: (r) => r.payable_cpr, render: (r) => <b>{money(r.payable_cpr)}</b> },
              { key: "s", label: "Paid", value: (r) => r.payment_status, render: (r) => (r.payment_status === "Paid" ? <Badge tone="green">{r.payment_scroll} · {dayLabel(r.paid_on)}</Badge> : <Badge tone="amber">Unpaid</Badge>) },
            ]} />
          </ChartCard>
        </>
      )}
    </div>
  );
}

// =============================================================== document vault
interface Docs {
  generated: { name: string; document_type: string; reference_doctype?: string; reference_name?: string; version: number; grower?: string; bank?: string; issued_on: string; issued_by: string; file: string; remarks?: string }[];
  vault: { name: string; title: string; document_type: string; grower?: string; grower_name?: string; authority?: string; reference_no?: string; issue_date?: string; expiry_date?: string; status: string; file?: string }[];
  counts: Record<string, number>; types: string[];
}
const VAULT_TONE: Record<string, Tone> = { Valid: "green", "Expiring Soon": "amber", Expired: "red", "No Expiry": "gray" };
const REF_PATH: Record<string, string> = { "Cane Payment Scroll": "/accounts/scroll?name=", "Grower Loan": "/accounts/loans?loan=" };

export function DocumentsPage() {
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const { data } = useQuery({ queryKey: ["sc-docs", q, type], queryFn: () => get<Docs>(`${API}.documents`, { q, document_type: type }) });
  return (
    <div className="space-y-5 p-4 sm:p-6">
      <Header title="Document vault" sub="Every bank letter, schedule, scroll and loan application printed is kept here as a versioned PDF; papers from outside are uploaded with their expiry">
        <div className="relative"><Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Scroll, loan, grower, bank…" className="h-9 w-64 pl-8" /></div>
        <Link to="/accounts/d/sugar-vault-document/new" className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground"><Plus className="size-4" />Upload to the vault</Link>
      </Header>
      <div className="grid gap-3 sm:grid-cols-4">
        <KpiCard icon={FileText} label="Generated documents" value={num(data?.generated.length)} color={C.blue} sub="latest 100" />
        {(["Valid", "Expiring Soon", "Expired"] as const).map((k) => <KpiCard key={k} icon={k === "Valid" ? CheckCircle2 : AlertTriangle} label={`Vault: ${k.toLowerCase()}`} value={num(data?.counts[k] ?? 0)} color={k === "Valid" ? C.green : k === "Expired" ? C.red : C.amber} />)}
      </div>
      <ChartCard title="Generated documents" sub="New version each time it is printed" bodyClass="h-auto"
        actions={<select value={type} onChange={(e) => setType(e.target.value)} className="h-8 rounded-lg border bg-background px-2 text-sm"><option value="">All documents</option>{data?.types.map((t) => <option key={t}>{t}</option>)}</select>}>
        <DataTable rows={data?.generated ?? []} rowKey={(r) => r.name} dense cols={[
          { key: "t", label: "Document", value: (r) => r.document_type, render: (r) => <span><b>{r.document_type}</b> <span className="text-xs text-muted-foreground">v{r.version}</span></span> },
          { key: "r", label: "Of", value: (r) => r.reference_name ?? "", render: (r) => (r.reference_name ? (REF_PATH[r.reference_doctype ?? ""] ? <Link className="font-mono text-xs text-primary hover:underline" to={`${REF_PATH[r.reference_doctype ?? ""]}${r.reference_name}`}>{r.reference_name}</Link> : <span className="font-mono text-xs">{r.reference_name}</span>) : <span className="text-xs text-muted-foreground">{r.remarks ?? "—"}</span>) },
          { key: "g", label: "Grower / bank", value: (r) => r.grower ?? r.bank ?? "", render: (r) => <span className="text-xs">{[r.grower, r.bank].filter(Boolean).join(" · ") || "—"}</span> },
          { key: "d", label: "Issued", value: (r) => r.issued_on, render: (r) => <span className="text-xs">{dayLabel(r.issued_on)} · {r.issued_by}</span> },
          { key: "f", label: "", value: () => "", render: (r) => <a href={r.file} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"><Download className="size-3.5" />PDF</a> },
        ]} />
      </ChartCard>
      <ChartCard title="Vault" sub="CNIC copies, fard, guarantee deeds, bank advices, cess challans, contracts, NOCs — with expiry alerts" bodyClass="h-auto">
        <DataTable rows={data?.vault ?? []} rowKey={(r) => r.name} dense cols={[
          { key: "t", label: "Title", value: (r) => r.title, render: (r) => <Link className="font-semibold hover:underline" to={`/accounts/d/sugar-vault-document/${r.name}`}>{r.title}</Link> },
          { key: "ty", label: "Type", value: (r) => r.document_type },
          { key: "g", label: "Grower", value: (r) => r.grower_name ?? "" },
          { key: "a", label: "Authority · ref", value: (r) => r.authority ?? "", render: (r) => <span className="text-xs">{r.authority ?? ""}{r.reference_no ? ` · ${r.reference_no}` : ""}</span> },
          { key: "e", label: "Expires", value: (r) => r.expiry_date ?? "", render: (r) => (r.expiry_date ? dayLabel(r.expiry_date) : "—") },
          { key: "s", label: "Status", value: (r) => r.status, render: (r) => <Badge tone={VAULT_TONE[r.status] ?? "gray"}>{r.status}</Badge> },
          { key: "f", label: "", value: () => "", render: (r) => (r.file ? <a href={r.file} target="_blank" rel="noreferrer" className="text-xs font-semibold text-primary hover:underline">open</a> : null) },
        ]} />
      </ChartCard>
    </div>
  );
}

// =============================================================== contractor bills
interface BillRow { name: string; contractor: string; bill_type: string; from_date: string; to_date: string; bill_date: string; status: string; docstatus: number; line_count: number; total_maund: number; gross_amount: number; deductions: number; net_amount: number; idle_hours: number; idle_amount: number; journal_entry?: string; unloading_contract?: string; loading_point?: string; depot?: string }
interface BillsData { rows: BillRow[]; contractors: string[]; unloading_contractor?: string; contracts: { name: string; contractor: string; valid_from: string; valid_to: string; status: string; rate_per_maund: number; idle_rate_per_hour: number }[] }
const BILL_TYPES = ["Unloading at Mill", "Loading at Loading Point", "Depot Freight and Commission"];

export function ContractorBillsPage() {
  const { data, refetch } = useQuery({ queryKey: ["sc-acc-bills"], queryFn: () => get<BillsData>(`${API}.contractor_bills`) });
  const [f, setF] = useState({ bill_type: BILL_TYPES[0], contractor: "", from_date: "", to_date: "" });
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<unknown>) => { setBusy(true); try { await fn(); refetch(); } catch (e) { toast.error(err(e)); } finally { setBusy(false); } };
  return (
    <div className="space-y-5 p-4 sm:p-6">
      <Header title="Contractor bills" sub="Unloading at the mill (with idle payment when the mill stops), loading at loading points, and depot freight & commission statements">
        <Link to="/accounts/d/unloading-contract" className="inline-flex h-9 items-center gap-2 rounded-lg border bg-card px-3 text-sm font-semibold hover:bg-accent"><FileText className="size-4" />Unloading contracts</Link>
      </Header>
      <section className="rounded-2xl border bg-card p-4 shadow-sm">
        <h3 className="mb-3 font-semibold">Make a bill</h3>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <select value={f.bill_type} onChange={(e) => setF({ ...f, bill_type: e.target.value })} className="h-9 rounded-lg border bg-background px-2 text-sm">{BILL_TYPES.map((t) => <option key={t}>{t}</option>)}</select>
          <select value={f.contractor} onChange={(e) => setF({ ...f, contractor: e.target.value })} className="h-9 rounded-lg border bg-background px-2 text-sm">
            <option value="">{f.bill_type === BILL_TYPES[0] && data?.unloading_contractor ? `Contractor: ${data.unloading_contractor}` : "Contractor"}</option>
            {data?.contractors.map((c) => <option key={c}>{c}</option>)}</select>
          <Input type="date" value={f.from_date} onChange={(e) => setF({ ...f, from_date: e.target.value })} title="From" />
          <Input type="date" value={f.to_date} onChange={(e) => setF({ ...f, to_date: e.target.value })} title="To" />
          <Button disabled={busy || !f.from_date || !f.to_date || (f.bill_type !== BILL_TYPES[0] && !f.contractor)} onClick={() => run(async () => {
            const b = await post<BillRow>(`${API}.make_bill`, f); toast.success(`${b.name}: ${b.line_count} lines · ${money(b.net_amount)}${b.idle_hours ? ` (idle ${b.idle_hours} h)` : ""}`);
          })}><Plus />Make bill</Button>
        </div>
      </section>
      <ChartCard title="Bills" bodyClass="h-auto">
        <DataTable rows={data?.rows ?? []} rowKey={(r) => r.name} dense cols={[
          { key: "n", label: "Bill", value: (r) => r.name, render: (r) => <Link className="font-mono text-xs font-semibold text-primary hover:underline" to={`/accounts/d/contractor-bill/${r.name}`}>{r.name}</Link> },
          { key: "c", label: "Contractor", value: (r) => r.contractor },
          { key: "t", label: "For", value: (r) => r.bill_type, render: (r) => <span className="text-xs">{r.bill_type}{r.loading_point ? ` · ${r.loading_point}` : r.depot ? ` · ${r.depot}` : ""}</span> },
          { key: "p", label: "Period", value: (r) => r.from_date, render: (r) => <span className="text-xs">{dayLabel(r.from_date)} – {dayLabel(r.to_date)}</span> },
          { key: "m", label: "Maund", align: "right", value: (r) => r.total_maund, render: (r) => num(r.total_maund) },
          { key: "i", label: "Idle", align: "right", value: (r) => r.idle_amount, render: (r) => (r.idle_hours ? <span className="text-xs">{r.idle_hours} h · {money(r.idle_amount)}</span> : "—") },
          { key: "d", label: "Deductions", align: "right", value: (r) => r.deductions, render: (r) => (r.deductions ? money(r.deductions) : "—") },
          { key: "a", label: "Net", align: "right", value: (r) => r.net_amount, render: (r) => <b>{money(r.net_amount)}</b> },
          { key: "s", label: "Status", value: (r) => r.status, render: (r) => (
            <span className="flex items-center gap-2"><Badge tone={r.status === "Posted" ? "green" : r.status === "Statement" ? "blue" : r.status === "Draft" ? "amber" : "gray"}>{r.status}</Badge>
              {r.docstatus === 0 && <Button size="sm" disabled={busy} onClick={() => run(async () => { await post(`${API}.post_bill`, { name: r.name }); toast.success("Posted"); })}>Post</Button>}
              <button type="button" title="Bill (PDF)" onClick={() => dl("contractor_bill_pdf", { name: r.name }, `Contractor bill ${r.name}.pdf`)} className="text-muted-foreground hover:text-foreground"><Download className="size-4" /></button></span>) },
        ]} />
      </ChartCard>
      <ChartCard title="Unloading contracts" bodyClass="h-auto">
        <DataTable rows={data?.contracts ?? []} rowKey={(r) => r.name} dense cols={[
          { key: "n", label: "Contract", value: (r) => r.name, render: (r) => <Link className="font-mono text-xs text-primary hover:underline" to={`/accounts/d/unloading-contract/${encodeURIComponent(r.name)}`}>{r.name}</Link> },
          { key: "c", label: "Contractor", value: (r) => r.contractor },
          { key: "v", label: "Valid", value: (r) => r.valid_from, render: (r) => `${dayLabel(r.valid_from)} – ${dayLabel(r.valid_to)}` },
          { key: "r", label: "Rate / md", align: "right", value: (r) => r.rate_per_maund, render: (r) => `Rs ${Number(r.rate_per_maund).toFixed(2)}` },
          { key: "i", label: "Idle / hour", align: "right", value: (r) => r.idle_rate_per_hour, render: (r) => money(r.idle_rate_per_hour) },
          { key: "s", label: "Status", value: (r) => r.status, render: (r) => <Badge tone={r.status === "Active" ? "green" : "gray"}>{r.status}</Badge> },
        ]} />
      </ChartCard>
    </div>
  );
}
