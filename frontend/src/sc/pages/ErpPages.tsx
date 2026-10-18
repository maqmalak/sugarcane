/**
 * Phase 7 — the standard ERPNext modules configured for the mill. React dashboards; the forms are ERPNext's own (desk).
 * - PurchasePage (/purchase): demand → inquiry → quotations → PO → GRN → bill; stock by store; store issues; returnable gate passes.
 * - SalesPage (/sales): godown, contracts, lifting, GST billing, receivables; the dispatch board (weigh empty → load → weigh loaded).
 * - FinancePage (/finance): bank / cash, payables / receivables, profit and EPS, PDCs; draft vouchers — batch post and print.
 * - HrPage (/hr): staff, attendance by shift, late marks (penalty), payroll.
 * Data: sugarcane.api.v1.erp.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Banknote, BarChart3, Boxes, CheckCircle2, ClipboardList, Clock, ExternalLink, FileText, Landmark, Package, Printer, Receipt, Scale,
  ShoppingCart, Truck, UserCheck, Users, Wallet,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import toast from "react-hot-toast";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { C, ChartCard, ChartTip, DataTable, KpiCard, useChartTheme } from "@/sc/components/analytics/kit";
import { Badge, type Tone } from "@/sc/components/ui/badge";
import { Button } from "@/sc/components/ui/button";
import { Input } from "@/sc/components/ui/input";
import { Skeleton } from "@/sc/components/ui/skeleton";
import { get, post, postDownload } from "@/sc/lib/api";
import { money, num } from "@/sc/lib/format";
import { cn } from "@/sc/lib/utils";
import { useTheme } from "@/sc/providers/theme";

const API = "sugarcane.api.v1.erp";
const err = (e: unknown) => (e instanceof Error ? e.message : String(e));
const dayLabel = (s?: string | null) => (s ? new Date(`${String(s).slice(0, 10)}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "—");
const rs = (v: number) => money(v, { compact: true });
const slug = (dt: string) => dt.toLowerCase().replace(/ /g, "-");

/** A desk (ERPNext) link: the standard forms open there. */
function Desk({ dt, name, children, className }: { dt: string; name?: string; children?: ReactNode; className?: string }) {
  return (
    <a href={`/app/${slug(dt)}${name ? `/${encodeURIComponent(name)}` : ""}`} target="_blank" rel="noreferrer"
      className={cn("inline-flex items-center gap-1 font-medium text-teal-600 hover:underline", className)}>
      {children ?? name ?? dt}<ExternalLink className="size-3" />
    </a>
  );
}

function Header({ kicker, icon: Icon, title, sub, children }: { kicker: string; icon: typeof Wallet; title: string; sub: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-teal-600"><Icon className="size-4" />{kicker}</div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        <p className="text-sm text-muted-foreground">{sub}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

function Shortcuts({ items }: { items: [string, string][] }) {
  return (
    <section className="rounded-2xl border bg-card p-4 shadow-sm">
      <p className="mb-2 text-sm font-semibold">New in ERPNext</p>
      <div className="flex flex-wrap gap-2">
        {items.map(([label, dt]) => (
          <a key={dt} href={`/app/${slug(dt)}/new`} target="_blank" rel="noreferrer" className="rounded-lg border px-3 py-1.5 text-sm hover:bg-accent">+ {label}</a>
        ))}
      </div>
    </section>
  );
}

function Reports({ items }: { items: string[] }) {
  return (
    <section className="rounded-2xl border bg-card p-4 shadow-sm">
      <p className="mb-2 flex items-center gap-2 text-sm font-semibold"><BarChart3 className="size-4 text-teal-600" />Reports</p>
      <div className="grid gap-1">
        {items.map((r) => <Link key={r} to={`/reports?r=${encodeURIComponent(r)}`} className="text-sm text-teal-600 hover:underline">{r} →</Link>)}
      </div>
    </section>
  );
}

const Loading = ({ error }: { error: unknown }) => (
  <div className="space-y-4">{error ? <p className="text-rose-600">{err(error)}</p> : <><Skeleton className="h-24" /><Skeleton className="h-64" /></>}</div>
);

// =============================================================== purchase & stores
interface Purchase {
  flow: { demands: number; inquiries: number; quotations: number; to_receive: { n: number; amt: number }; grn_month: { n: number; amt: number };
    to_pay: { n: number; amt: number }; qi_pending: number };
  suppliers: { supplier: string; supplier_name: string; orders: number; amount: number }[];
  stock: { warehouse: string; value: number; items: number }[];
  issues: { stock_entry_type: string; n: number; value: number }[];
  orders: { name: string; supplier_name: string; transaction_date: string; grand_total: number; status: string; per_received: number; per_billed: number }[];
  passes: { name: string; party_name: string; posting_date: string; expected_return_date: string; status: string; vehicle_no: string }[];
  today: string;
}

export function PurchasePage() {
  const q = useQuery({ queryKey: ["erp-purchase"], queryFn: () => get<Purchase>(`${API}.purchase`) });
  const qc = useQueryClient();
  const { dark } = useTheme();
  const t = useChartTheme(dark);
  const d = q.data;
  if (!d) return <Loading error={q.error} />;
  const back = async (name: string) => {
    try { await post(`${API}.gate_pass_return`, { name }); toast.success(`${name}: items back`); void qc.invalidateQueries({ queryKey: ["erp-purchase"] }); } catch (e) { toast.error(err(e)); }
  };
  const steps: [string, string, number | string, string, string][] = [
    ["Purchase demands", "Material Request", d.flow.demands, "open", "Material Request"],
    ["Inquiries (RFQ)", "Request for Quotation", d.flow.inquiries, "sent", "Request for Quotation"],
    ["Quotations", "Supplier Quotation", d.flow.quotations, "received", "Supplier Quotation"],
    ["Orders to receive", "Purchase Order", d.flow.to_receive.n, rs(d.flow.to_receive.amt), "Purchase Order"],
    ["GRN this month", "Purchase Receipt", d.flow.grn_month.n, rs(d.flow.grn_month.amt), "Purchase Receipt"],
    ["Bills to pay", "Purchase Invoice", d.flow.to_pay.n, rs(d.flow.to_pay.amt), "Purchase Invoice"],
  ];
  return (
    <div className="space-y-4">
      <Header kicker="Purchase & stores" icon={ShoppingCart} title="Purchase and stores" sub="Purchase demand → inquiry → comparative statement → order → GRN with quality check → bill with withholding → payment. Store issues by department; gate passes for everything leaving the mill." />
      <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
        {steps.map(([label, , n, sub, dt], i) => (
          <a key={label} href={`/app/${slug(dt)}`} target="_blank" rel="noreferrer" className="relative rounded-2xl border bg-card p-4 shadow-sm hover:shadow-md">
            <p className="text-xs text-muted-foreground">{i + 1}. {label}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{n}</p>
            <p className="text-xs text-muted-foreground">{sub}</p>
          </a>
        ))}
      </div>
      {d.flow.qi_pending > 0 && <p className="text-sm text-amber-600">{d.flow.qi_pending} quality inspection(s) waiting — <Desk dt="Quality Inspection">open</Desk></p>}
      <div className="grid gap-4 xl:grid-cols-3">
        <ChartCard title="Stock by store" sub="Stock value per warehouse (ERPNext valuation)" className="xl:col-span-2" bodyClass="h-72">
          <ResponsiveContainer>
            <BarChart data={d.stock.map((s) => ({ ...s, label: s.warehouse.replace(/ - \w+$/, "") }))} layout="vertical" margin={{ left: 20, right: 16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={t.grid} horizontal={false} />
              <XAxis type="number" tick={{ fill: t.axis, fontSize: 11 }} tickFormatter={(v) => rs(v).replace("Rs ", "")} />
              <YAxis type="category" dataKey="label" tick={{ fill: t.axis, fontSize: 11 }} width={120} />
              <Tooltip content={<ChartTip />} />
              <Bar dataKey="value" name="Value" fill={C.teal} radius={[0, 4, 4, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <div className="space-y-4">
          <Shortcuts items={[["Purchase demand", "Material Request"], ["Inquiry (RFQ)", "Request for Quotation"], ["Purchase order", "Purchase Order"], ["GRN", "Purchase Receipt"], ["Store issue", "Stock Entry"], ["Gate pass", "Gate Pass"]]} />
          <Reports items={["Comparative Statement", "Gate Pass Outstanding", "Payables Projection"]} />
        </div>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard title="Purchase orders" sub="Latest orders, received and billed" bodyClass="">
          <div className="px-3 pb-3">
            <DataTable rows={d.orders} rowKey={(r) => r.name} dense cols={[
              { key: "name", label: "PO", render: (r) => <Desk dt="Purchase Order" name={r.name} /> },
              { key: "supplier_name", label: "Supplier" },
              { key: "transaction_date", label: "Date", render: (r) => dayLabel(r.transaction_date), hideSm: true },
              { key: "grand_total", label: "Amount", align: "right", render: (r) => rs(r.grand_total) },
              { key: "per_received", label: "Received", align: "right", render: (r) => `${Math.round(r.per_received)}%` },
              { key: "per_billed", label: "Billed", align: "right", render: (r) => `${Math.round(r.per_billed)}%`, hideSm: true },
            ]} />
          </div>
        </ChartCard>
        <div className="space-y-4">
          <ChartCard title="Store issues this month" sub="By stock entry type" bodyClass="">
            <div className="px-3 pb-3">
              <DataTable rows={d.issues} rowKey={(r) => r.stock_entry_type} dense cols={[
                { key: "stock_entry_type", label: "Type" }, { key: "n", label: "Entries", align: "right" },
                { key: "value", label: "Value", align: "right", render: (r) => rs(r.value) },
              ]} />
              {!d.issues.length && <p className="p-3 text-sm text-muted-foreground">No issues this month.</p>}
            </div>
          </ChartCard>
          <ChartCard title="Out on returnable gate passes" sub="Items expected back" bodyClass="">
            <div className="divide-y px-4 pb-3">
              {d.passes.length === 0 && <p className="py-3 text-sm text-muted-foreground">Nothing out.</p>}
              {d.passes.map((p) => {
                const late = p.expected_return_date < d.today;
                return (
                  <div key={p.name} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                    <Link to={`/purchase/d/gate-pass/${p.name}`} className="font-mono text-teal-600 hover:underline">{p.name}</Link>
                    <span className="flex-1">{p.party_name} · {p.vehicle_no}</span>
                    <Badge tone={late ? "red" : "amber"}>back by {dayLabel(p.expected_return_date)}</Badge>
                    <Button size="sm" variant="outline" onClick={() => back(p.name)}>Mark returned</Button>
                  </div>
                );
              })}
            </div>
          </ChartCard>
        </div>
      </div>
    </div>
  );
}

// =============================================================== sugar sales
interface Sales {
  godown_bags: number; contracts: { n: number; bags: number; amt: number }; lifted: { n: number; qty: number; amt: number };
  billed: { amt: number; tax: number }; receivable: { n: number; amt: number }; aging: { bucket: string; amount: number }[];
  territory: { territory: string; qty: number; amount: number }[]; trend: { day: string; qty: number; amount: number }[];
  loading: { name: string; delivery_note: string; customer_name: string; vehicle_no: string; tare_kg: number; tare_at: string; bags: number; expected_kg: number; terminal: string }[];
  to_load: { name: string; customer_name: string; total_qty: number; posting_date: string; dispatch_vehicle_no: string; delivery_order_no: string }[];
  dispatches: { name: string; posting_date: string; customer_name: string; total_qty: number; base_grand_total: number; vehicle_no: string; gate_pass: string; net_kg: number; difference_pct: number; within_limit: number }[];
  terminals: string[]; rates: { item_code: string; price_list_rate: number }[];
}

export function SalesPage() {
  const q = useQuery({ queryKey: ["erp-sales"], queryFn: () => get<Sales>(`${API}.sales`), refetchInterval: 30_000 });
  const qc = useQueryClient();
  const { dark } = useTheme();
  const t = useChartTheme(dark);
  const [terminal, setTerminal] = useState("");
  const [manual, setManual] = useState<Record<string, string>>({});
  const d = q.data;
  if (!d) return <Loading error={q.error} />;
  const term = terminal || d.terminals[0] || "";
  const reload = () => qc.invalidateQueries({ queryKey: ["erp-sales"] });
  const kg = (k: string) => (manual[k] ? { manual_kg: manual[k], note: "typed in at the dispatch board" } : {});
  const empty = async (dn: Sales["to_load"][number]) => {
    try {
      await post(`${API}.weigh_empty`, { delivery_note: dn.name, vehicle_no: dn.dispatch_vehicle_no || prompt("Vehicle number") || "", terminal: term, ...kg(dn.name) });
      toast.success(`${dn.name}: empty truck weighed — load it`); void reload();
    } catch (e) { toast.error(err(e)); }
  };
  const loaded = async (w: Sales["loading"][number]) => {
    try {
      const r = await post<{ net_kg: number; difference_pct: number }>(`${API}.weigh_loaded`, { name: w.name, ...kg(w.name) });
      toast.success(`Net ${num(r.net_kg)} kg (${r.difference_pct.toFixed(2)}%) — Delivery Order posted, gate pass made`); void reload();
    } catch (e) { toast.error(err(e)); }
  };
  const rate = d.rates.find((r) => r.item_code === "SUGAR-50KG")?.price_list_rate;
  return (
    <div className="space-y-4">
      <Header kicker="Sugar sales" icon={Receipt} title="Sugar sales and dispatch" sub={<>Contracts (Sales Orders) with dealers and agents, Delivery Orders lifted on the weighbridge, GST invoices, receivables. Rate list: <b>{rate ? `${money(rate)} per 50 kg bag` : "—"}</b>.</>}>
        <span className="text-sm text-muted-foreground">Weighbridge</span>
        <select value={term} onChange={(e) => setTerminal(e.target.value)} className="h-9 rounded-lg border bg-background px-2 text-sm">{d.terminals.map((x) => <option key={x}>{x}</option>)}</select>
      </Header>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard icon={Package} label="Sugar in godown" value={`${num(d.godown_bags)} bags`} color={C.teal} sub={`${num(d.godown_bags * 50 / 1000)} t`} />
        <KpiCard icon={ClipboardList} label="Open contracts" value={`${num(d.contracts.bags)} bags`} color={C.violet} sub={`${d.contracts.n} contracts · ${rs(d.contracts.amt)}`} />
        <KpiCard icon={Truck} label="Lifted this month" value={`${num(d.lifted.qty)} bags`} color={C.amber} sub={`${d.lifted.n} Delivery Orders · ${rs(d.lifted.amt)}`} />
        <KpiCard icon={FileText} label="Invoiced this month" value={rs(d.billed.amt)} color={C.blue} sub={`GST ${rs(d.billed.tax)}`} />
        <KpiCard icon={Wallet} label="Receivable" value={rs(d.receivable.amt)} color={C.rose} sub={`${d.receivable.n} invoices`} />
      </div>
      <section className="rounded-2xl border bg-card shadow-sm">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-3">
          <div><h3 className="flex items-center gap-2 font-semibold"><Scale className="size-4 text-teal-600" />Dispatch board</h3>
            <p className="text-xs text-muted-foreground">Weigh the empty truck, load the bags, weigh it loaded: within ±tolerance the Delivery Order posts and the gate pass is made. Leave the kg empty to take the live weighbridge reading.</p></div>
        </header>
        <div className="grid gap-0 divide-y md:grid-cols-2 md:divide-x md:divide-y-0">
          <div className="p-4">
            <p className="mb-2 text-sm font-semibold">1 · At the gate — weigh empty ({d.to_load.length})</p>
            {d.to_load.length === 0 && <p className="text-sm text-muted-foreground">No Delivery Order waiting.</p>}
            {d.to_load.map((x) => (
              <div key={x.name} className="mb-2 flex flex-wrap items-center gap-2 rounded-xl border p-2 text-sm">
                <Desk dt="Delivery Note" name={x.name} /><span className="flex-1">{x.customer_name} · {num(x.total_qty)} bags · {x.dispatch_vehicle_no || "vehicle?"}</span>
                <Input className="h-8 w-24" placeholder="kg" value={manual[x.name] ?? ""} onChange={(e) => setManual({ ...manual, [x.name]: e.target.value })} />
                <Button size="sm" onClick={() => empty(x)} disabled={!term}>Weigh empty</Button>
              </div>
            ))}
          </div>
          <div className="p-4">
            <p className="mb-2 text-sm font-semibold">2 · Loading — weigh loaded ({d.loading.length})</p>
            {d.loading.length === 0 && <p className="text-sm text-muted-foreground">No truck being loaded.</p>}
            {d.loading.map((w) => (
              <div key={w.name} className="mb-2 flex flex-wrap items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/5 p-2 text-sm">
                <span className="font-mono">{w.vehicle_no}</span><span className="flex-1">{w.customer_name} · {num(w.bags)} bags · empty {num(w.tare_kg)} kg · expect +{num(Math.round(w.expected_kg))} kg</span>
                <Input className="h-8 w-24" placeholder="kg" value={manual[w.name] ?? ""} onChange={(e) => setManual({ ...manual, [w.name]: e.target.value })} />
                <Button size="sm" onClick={() => loaded(w)}>Weigh loaded</Button>
              </div>
            ))}
          </div>
        </div>
      </section>
      <div className="grid gap-4 xl:grid-cols-3">
        <ChartCard title="Lifting — last 30 days" sub="Bags lifted per day and value" className="xl:col-span-2" bodyClass="h-64">
          <ResponsiveContainer>
            <ComposedChart data={d.trend.map((x) => ({ ...x, label: dayLabel(x.day) }))} margin={{ left: 0, right: 8, top: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={t.grid} vertical={false} />
              <XAxis dataKey="label" tick={{ fill: t.axis, fontSize: 11 }} />
              <YAxis yAxisId="q" tick={{ fill: t.axis, fontSize: 11 }} width={44} />
              <YAxis yAxisId="a" orientation="right" tick={{ fill: t.axis, fontSize: 11 }} width={56} tickFormatter={(v) => rs(v).replace("Rs ", "")} />
              <Tooltip content={<ChartTip fmt={(v, k) => (k === "qty" ? `${num(v)} bags` : money(v))} />} />
              <Bar yAxisId="q" dataKey="qty" name="Bags" fill={C.amber} radius={[4, 4, 0, 0]} isAnimationActive={false} />
              <Line yAxisId="a" dataKey="amount" name="Value" stroke={C.teal} strokeWidth={2} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>
        <div className="space-y-4">
          <ChartCard title="Receivable ageing" sub="Outstanding by days past due" bodyClass="">
            <div className="space-y-1 px-5 pb-4 text-sm">
              {d.aging.map((a) => <div key={a.bucket} className="flex justify-between"><span>{a.bucket}</span><b className="tabular-nums">{money(a.amount)}</b></div>)}
              {!d.aging.length && <p className="text-muted-foreground">Nothing outstanding.</p>}
            </div>
          </ChartCard>
          <Reports items={["Sugar Dispatch Register", "Accounts Receivable", "Sales Analytics", "Territory Target Variance Based On Item Group"]} />
        </div>
      </div>
      <ChartCard title="Delivery Orders lifted" sub="Truck weight against bags × 50 kg (+ packing)" bodyClass="">
        <div className="px-3 pb-3">
          <DataTable rows={d.dispatches} rowKey={(r) => r.name} dense cols={[
            { key: "name", label: "Delivery Order", render: (r) => <Desk dt="Delivery Note" name={r.name} /> },
            { key: "posting_date", label: "Date", render: (r) => dayLabel(r.posting_date) },
            { key: "customer_name", label: "Customer" },
            { key: "vehicle_no", label: "Vehicle", hideSm: true },
            { key: "total_qty", label: "Bags", align: "right" },
            { key: "net_kg", label: "Net kg", align: "right", render: (r) => (r.net_kg ? num(r.net_kg) : "—") },
            { key: "difference_pct", label: "Diff", align: "right", render: (r) => (r.net_kg ? <span className={r.within_limit ? "text-emerald-600" : "text-rose-600"}>{r.difference_pct.toFixed(2)}%</span> : "—") },
            { key: "gate_pass", label: "Gate pass", render: (r) => (r.gate_pass ? <Link to={`/purchase/d/gate-pass/${r.gate_pass}`} className="font-mono text-teal-600 hover:underline">{r.gate_pass}</Link> : "—"), hideSm: true },
            { key: "base_grand_total", label: "Value", align: "right", render: (r) => rs(r.base_grand_total) },
          ]} />
        </div>
      </ChartCard>
      <Shortcuts items={[["Sales contract", "Sales Order"], ["Delivery Order", "Delivery Note"], ["Sales invoice", "Sales Invoice"], ["Receipt", "Payment Entry"], ["Customer", "Customer"]]} />
    </div>
  );
}

// =============================================================== finance
interface Fin {
  banks: { account: string; account_name: string; balance: number }[]; cash: { account: string; account_name: string; balance: number }[];
  payable: number; receivable: number; profit: { from: string; income: number; expense: number; profit: number; eps: number };
  drafts: { doctype: string; name: string; code: string; posting_date: string; amount: number; remark: string; owner: string }[];
  recent: { name: string; voucher_code: string; posting_date: string; total_debit: number; user_remark: string }[];
  codes: { code: string; n: number; amount: number }[]; pdc: { n: number; issued: number; received: number };
  assets: { n: number; cost: number; book: number };
}
const CODE_TONE: Record<string, Tone> = { JV: "gray", BPV: "red", BRV: "green", CPV: "orange", CRV: "blue" };

export function FinancePage() {
  const q = useQuery({ queryKey: ["erp-finance"], queryFn: () => get<Fin>(`${API}.finance`) });
  const qc = useQueryClient();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const d = q.data;
  const refs = useMemo(() => [...sel], [sel]);
  if (!d) return <Loading error={q.error} />;
  const key = (r: { doctype: string; name: string }) => `${r.doctype}::${r.name}`;
  const toggle = (k: string) => setSel((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const postSel = async () => {
    try {
      const r = await post<{ posted: string[]; failed: { name: string; error: string }[] }>(`${API}.post_vouchers`, { refs: JSON.stringify(refs) });
      toast.success(`${r.posted.length} voucher(s) posted`);
      r.failed.forEach((f) => toast.error(`${f.name}: ${f.error}`));
      setSel(new Set()); void qc.invalidateQueries({ queryKey: ["erp-finance"] });
    } catch (e) { toast.error(err(e)); }
  };
  const printRefs = async (list: string[]) => {
    try { await postDownload(`${API}.print_vouchers`, { refs: JSON.stringify(list) }, "vouchers.pdf"); } catch (e) { toast.error(err(e)); }
  };
  const bank = d.banks.reduce((a, b) => a + b.balance, 0), cash = d.cash.reduce((a, b) => a + b.balance, 0);
  return (
    <div className="space-y-4">
      <Header kicker="Finance" icon={Landmark} title="Finance and accounts" sub="Five-level chart of accounts, JV / BPV / BRV / CPV / CRV vouchers, batch posting and voucher printing, cheques, withholding and GST, fixed assets on two books." />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <KpiCard icon={Landmark} label="Bank" value={rs(bank)} color={C.blue} sub={`${d.banks.length} accounts`} />
        <KpiCard icon={Banknote} label="Cash in hand" value={rs(cash)} color={C.emerald} sub={`${d.cash.length} counters`} />
        <KpiCard icon={Receipt} label="Payable (bills)" value={rs(d.payable)} color={C.rose} to="/reports?r=Payables%20Projection" sub="see the projection" />
        <KpiCard icon={Wallet} label="Receivable" value={rs(d.receivable)} color={C.amber} />
        <KpiCard icon={BarChart3} label={`Profit since ${dayLabel(d.profit.from)}`} value={rs(d.profit.profit)} color={d.profit.profit >= 0 ? C.teal : C.rose}
          to="/reports?r=Earnings%20Per%20Share" sub={`EPS Rs ${d.profit.eps.toFixed(2)}`} />
        <KpiCard icon={Clock} label="Post-dated cheques" value={`${d.pdc.n}`} color={C.violet} to="/reports?r=Post%20Dated%20Cheques"
          sub={`in ${rs(d.pdc.received)} · out ${rs(d.pdc.issued)}`} />
      </div>
      <section className="rounded-2xl border bg-card shadow-sm">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-3">
          <div><h3 className="font-semibold">Vouchers waiting to be posted ({d.drafts.length})</h3>
            <p className="text-xs text-muted-foreground">Tick and post together (each is checked on its own), or print them — one voucher a page with Prepared / Checked / Approved / Received.</p></div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setSel(sel.size === d.drafts.length ? new Set() : new Set(d.drafts.map(key)))}>{sel.size === d.drafts.length && sel.size ? "Clear" : "Select all"}</Button>
            <Button size="sm" variant="outline" disabled={!sel.size} onClick={() => printRefs(refs)}><Printer className="size-4" />Print {sel.size || ""}</Button>
            <Button size="sm" disabled={!sel.size} onClick={postSel}><CheckCircle2 className="size-4" />Post {sel.size || ""}</Button>
          </div>
        </header>
        <div className="divide-y">
          {d.drafts.length === 0 && <p className="p-5 text-sm text-muted-foreground">No drafts.</p>}
          {d.drafts.map((r) => (
            <label key={key(r)} className="flex cursor-pointer flex-wrap items-center gap-3 px-5 py-2 text-sm hover:bg-accent/40">
              <input type="checkbox" checked={sel.has(key(r))} onChange={() => toggle(key(r))} />
              <Badge tone={CODE_TONE[r.code] ?? "gray"}>{r.code || "JV"}</Badge>
              <Desk dt={r.doctype} name={r.name} />
              <span className="text-muted-foreground">{dayLabel(r.posting_date)}</span>
              <span className="min-w-0 flex-1 truncate">{r.remark}</span>
              <b className="tabular-nums">{money(r.amount)}</b>
            </label>
          ))}
        </div>
      </section>
      <div className="grid gap-4 xl:grid-cols-3">
        <ChartCard title="Posted vouchers" sub="Latest journals; print any" className="xl:col-span-2" bodyClass="">
          <div className="px-3 pb-3">
            <DataTable rows={d.recent} rowKey={(r) => r.name} dense cols={[
              { key: "voucher_code", label: "Type", render: (r) => <Badge tone={CODE_TONE[r.voucher_code] ?? "gray"}>{r.voucher_code || "JV"}</Badge> },
              { key: "name", label: "Voucher", render: (r) => <Desk dt="Journal Entry" name={r.name} /> },
              { key: "posting_date", label: "Date", render: (r) => dayLabel(r.posting_date) },
              { key: "user_remark", label: "Narration", render: (r) => <span className="line-clamp-1">{r.user_remark}</span>, hideSm: true },
              { key: "total_debit", label: "Amount", align: "right", render: (r) => rs(r.total_debit) },
              { key: "print", label: "", render: (r) => <button onClick={() => printRefs([`Journal Entry::${r.name}`])} className="text-teal-600 hover:underline"><Printer className="size-4" /></button> },
            ]} />
          </div>
        </ChartCard>
        <div className="space-y-4">
          <ChartCard title="This month by voucher type" bodyClass="">
            <div className="space-y-1 px-5 pb-4 text-sm">
              {d.codes.map((c) => <div key={c.code} className="flex items-center justify-between"><Badge tone={CODE_TONE[c.code] ?? "gray"}>{c.code}</Badge><span>{c.n}</span><b className="tabular-nums">{rs(c.amount)}</b></div>)}
              <p className="pt-2 text-xs text-muted-foreground">Fixed assets: {d.assets.n} · cost {rs(d.assets.cost)}</p>
            </div>
          </ChartCard>
          <Reports items={["Voucher Register", "Payables Projection", "Post Dated Cheques", "Earnings Per Share", "WPPF and WWF", "General Ledger", "Trial Balance", "Balance Sheet", "Profit and Loss Statement"]} />
        </div>
      </div>
      <Shortcuts items={[["Journal voucher", "Journal Entry"], ["Payment / receipt", "Payment Entry"], ["Bank reconciliation", "Bank Reconciliation Tool"], ["Cheque template", "Cheque Print Template"], ["Asset", "Asset"], ["Project", "Project"]]} />
    </div>
  );
}

// =============================================================== HR & payroll
interface Hr {
  day: string; active: number; staff: { department: string; n: number; seasonal: number }[]; attendance: Record<string, number>; late: number;
  checkins: { n: number; people: number }; shifts: { shift: string; n: number; late: number }[];
  payroll: { month: string; slips: number; gross: number; deductions: number; net: number }[];
  trend: { day: string; present: number; absent: number; late: number }[];
  leaves: { name: string; employee_name: string; leave_type: string; from_date: string; to_date: string; total_leave_days: number }[];
  late_month: { employee: string; employee_name: string; department: string; late: number }[]; month: string;
}

export function HrPage() {
  const q = useQuery({ queryKey: ["erp-hr"], queryFn: () => get<Hr>(`${API}.hr`) });
  const { dark } = useTheme();
  const t = useChartTheme(dark);
  const d = q.data;
  if (!d) return <Loading error={q.error} />;
  const penalties = async () => {
    try {
      const r = await post<{ made: unknown[]; skipped: unknown[]; per_day: number }>(`${API}.late_penalties`, { month: d.month });
      toast.success(`${r.made.length} penalty deduction(s) made (every ${r.per_day} late marks = 1 day); ${r.skipped.length} already done`);
    } catch (e) { toast.error(err(e)); }
  };
  const last = d.payroll[0];
  return (
    <div className="space-y-4">
      <Header kicker="HR & payroll" icon={Users} title="People and payroll" sub={<>Shifts A / B / C, biometric check-ins, late marks and penalties, leave under the Factories Act, EOBI / PESSI / PF, income tax on the Finance Act 2025 slabs. Attendance for <b>{dayLabel(d.day)}</b>.</>} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <KpiCard icon={Users} label="Active staff" value={num(d.active)} color={C.blue} sub={`${d.staff.reduce((a, s) => a + s.seasonal, 0)} seasonal`} />
        <KpiCard icon={UserCheck} label="Present" value={num(d.attendance.Present ?? 0)} color={C.emerald} sub={`${d.attendance.Absent ?? 0} absent · ${d.attendance["On Leave"] ?? 0} on leave`} />
        <KpiCard icon={Clock} label="Late today" value={num(d.late)} color={C.amber} sub="after the 10-min grace" />
        <KpiCard icon={Scale} label="Biometric punches" value={num(d.checkins.n)} color={C.violet} sub={`${d.checkins.people} people`} />
        <KpiCard icon={Banknote} label={`Payroll ${last?.month ?? ""}`} value={last ? rs(last.net) : "—"} color={C.teal} sub={last ? `${last.slips} slips · gross ${rs(last.gross)}` : ""} />
        <KpiCard icon={Boxes} label="Departments" value={num(d.staff.length)} color={C.slate} />
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <ChartCard title="Attendance — last 14 days" sub="Present, absent and late" className="xl:col-span-2" bodyClass="h-64">
          <ResponsiveContainer>
            <BarChart data={d.trend.map((x) => ({ ...x, label: dayLabel(x.day) }))} margin={{ left: 0, right: 8, top: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={t.grid} vertical={false} />
              <XAxis dataKey="label" tick={{ fill: t.axis, fontSize: 11 }} />
              <YAxis tick={{ fill: t.axis, fontSize: 11 }} width={36} />
              <Tooltip content={<ChartTip fmt={(v) => num(v)} />} />
              <Bar dataKey="present" name="Present" stackId="a" fill={C.emerald} isAnimationActive={false} />
              <Bar dataKey="absent" name="Absent" stackId="a" fill={C.rose} isAnimationActive={false} />
              <Bar dataKey="late" name="Late" fill={C.amber} radius={[4, 4, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title={`Late marks — ${d.month}`} sub="Every 3 late marks = one day's pay" bodyClass="">
          <div className="space-y-1 px-5 pb-4 text-sm">
            {d.late_month.map((r) => <div key={r.employee} className="flex justify-between"><span>{r.employee_name} <span className="text-xs text-muted-foreground">{r.department?.replace(/ - \w+$/, "")}</span></span><b>{r.late}</b></div>)}
            {!d.late_month.length && <p className="text-muted-foreground">No late marks.</p>}
            <Button size="sm" variant="outline" className="mt-2" onClick={penalties}>Apply late penalties</Button>
          </div>
        </ChartCard>
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <ChartCard title="Staff by department" bodyClass="">
          <div className="px-3 pb-3">
            <DataTable rows={d.staff} rowKey={(r) => r.department} dense cols={[
              { key: "department", label: "Department", render: (r) => r.department.replace(/ - \w+$/, "") },
              { key: "n", label: "Staff", align: "right", bar: { color: C.blue } }, { key: "seasonal", label: "Seasonal", align: "right" },
            ]} />
          </div>
        </ChartCard>
        <ChartCard title="Payroll" sub="Salary slips by month" bodyClass="">
          <div className="px-3 pb-3">
            <DataTable rows={d.payroll} rowKey={(r) => r.month} dense cols={[
              { key: "month", label: "Month" }, { key: "slips", label: "Slips", align: "right" },
              { key: "gross", label: "Gross", align: "right", render: (r) => rs(r.gross) }, { key: "deductions", label: "Deductions", align: "right", render: (r) => rs(r.deductions) },
              { key: "net", label: "Net", align: "right", render: (r) => rs(r.net) },
            ]} />
          </div>
        </ChartCard>
        <div className="space-y-4">
          <ChartCard title="By shift" sub={dayLabel(d.day)} bodyClass="">
            <div className="space-y-1 px-5 pb-4 text-sm">{d.shifts.map((s) => <div key={s.shift} className="flex justify-between"><span>{s.shift}</span><span>{s.n} · <span className="text-amber-600">{s.late} late</span></span></div>)}</div>
          </ChartCard>
          <Reports items={["Late Coming Register", "Monthly Attendance Sheet", "Salary Register", "Income Tax Deductions"]} />
        </div>
      </div>
      <Shortcuts items={[["Employee", "Employee"], ["Leave application", "Leave Application"], ["Payroll entry", "Payroll Entry"], ["Additional salary", "Additional Salary"], ["Overtime / CPL", "Compensatory Leave Request"], ["Full & final", "Full and Final Statement"]]} />
    </div>
  );
}
