/**
 * Payee displays — a second screen facing the driver / grower (no menu, large text, English + Urdu):
 * - /display?screen=counter:<Cash Counter> — the bilties being paid, the total, then "Paid".
 * - /display?screen=wb:<Weighbridge Terminal> — the live weight, platform OK, the vehicle and grower, then the gross / tare / net.
 * The counter and weighbridge screens push what to show (sugarcane.api.v1.counter.display_push); this page polls it every second.
 * DisplaysPage (/procurement/displays) lists the screens to open on each display PC.
 */
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, ExternalLink, MonitorSmartphone, Scale, Wallet } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { get } from "@/sc/lib/api";
import { cn } from "@/sc/lib/utils";

interface Item { name: string; vehicle_no?: string; amount: number; cpr?: string }
interface Disp {
  state?: string; at?: string; company?: string;
  // counter
  counter?: { name: string; display_title?: string; display_note?: string } | null; total?: number; payee?: string; cnic?: string; mode?: string; wallet?: string; items?: Item[];
  // weighbridge
  terminal?: { name: string; terminal_name: string } | null; reading?: { weight_kg: number; stable: number; age_s: number; platform_ok?: number | null } | null;
  stage?: string; token?: string; vehicle_no?: string; vehicle_type?: string; grower_name?: string; gross_kg?: number; weight_kg?: number; net_kg?: number; cpr?: string;
}

const rs = (n?: number) => `Rs ${Math.round(n ?? 0).toLocaleString("en-PK")}`;
const kg = (n?: number) => `${Math.round(n ?? 0).toLocaleString("en-PK")} kg`;
const Ur = ({ children, className }: { children: string; className?: string }) => <div dir="rtl" lang="ur" className={cn("font-[Noto_Nastaliq_Urdu,serif] leading-loose", className)}>{children}</div>;

function Clock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  return <span className="tabular-nums">{now.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })} · {now.toLocaleTimeString("en-GB")}</span>;
}

function Plate({ no }: { no?: string }) {
  return <span className="inline-block rounded-lg bg-yellow-300 px-3 py-1 font-mono font-black tracking-wider text-black">{no || "—"}</span>;
}

function CounterScreen({ d }: { d: Disp }) {
  const title = d.counter?.display_title || d.counter?.name || "Cash Counter";
  if (d.state === "basket" && d.items?.length) return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="text-4xl font-bold">{d.payee ?? ""}{d.cnic && <span className="ml-4 text-2xl font-normal text-slate-400">{d.cnic}</span>}</div>
      <div className="flex-1 space-y-2 overflow-hidden">
        {d.items.map((i) => (
          <div key={i.name} className="flex items-center gap-6 rounded-2xl bg-white/5 px-6 py-4 text-3xl">
            <span className="font-mono text-slate-300">{i.name}</span><Plate no={i.vehicle_no} /><span className="ml-auto font-bold tabular-nums">{rs(i.amount)}</span>
          </div>
        ))}
      </div>
      <div className="flex items-end justify-between rounded-3xl bg-amber-400 px-8 py-6 text-slate-950">
        <div><div className="text-2xl font-bold">TOTAL · {d.items.length} {d.items.length === 1 ? "bilty" : "bilties"}</div><Ur className="text-3xl">کل رقم</Ur></div>
        <div className="text-8xl font-black tabular-nums">{rs(d.total)}</div>
      </div>
    </div>
  );
  if (d.state === "paid") return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
      <CheckCircle2 className="size-40 text-emerald-400" />
      <div className="text-7xl font-black text-emerald-400">PAID {rs(d.total)}</div>
      <Ur className="text-6xl text-emerald-300">ادائیگی ہو گئی — شکریہ</Ur>
      <div className="text-3xl text-slate-300">{d.mode === "JazzCash" ? `by JazzCash to ${d.wallet ?? ""}` : "in cash — please count it here"} · {d.payee}</div>
      <div className="text-2xl text-slate-400">{(d.items ?? []).map((i) => i.name).join(" · ")}</div>
    </div>
  );
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
      <Wallet className="size-32 text-amber-400" />
      <div className="text-7xl font-black">{d.state === "closed" ? "Counter closed" : "Next, please"}</div>
      <Ur className="text-6xl text-amber-300">{d.state === "closed" ? "کاؤنٹر بند ہے" : "اگلا، براہ مہربانی"}</Ur>
      <div className="max-w-4xl text-3xl text-slate-300">{d.counter?.display_note ?? "Show your bilty and CNIC"}</div>
      <div className="text-xl text-slate-500">{title}</div>
    </div>
  );
}

function WeighScreen({ d }: { d: Disp }) {
  const r = d.reading;
  const live = r && r.age_s < 15;
  const stable = live && r?.stable;
  const plat = r?.platform_ok;
  const stageUr = d.stage === "Gross" ? "پہلا وزن (بھرا ہوا)" : d.stage === "Tare" ? "دوسرا وزن (خالی)" : "";
  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className={cn("rounded-3xl border-4 bg-black px-8 py-6 text-center", !live ? "border-slate-700" : stable ? "border-emerald-500" : "border-amber-400")}>
        <div className={cn("font-mono text-[11rem] font-black leading-none tabular-nums", !live ? "text-slate-600" : stable ? "text-emerald-400" : "text-amber-300")}>
          {live ? Math.round(r!.weight_kg).toLocaleString("en-PK") : "------"}<span className="ml-4 text-6xl">kg</span></div>
        <div className="mt-3 flex items-center justify-center gap-8 text-3xl font-bold uppercase">
          <span className={!live ? "text-slate-500" : stable ? "text-emerald-400" : "text-amber-300"}>{!live ? "no signal" : stable ? "stable · مستحکم" : "moving · رکیں"}</span>
          {plat !== null && plat !== undefined && (r?.weight_kg ?? 0) > 0 && (
            <span className={plat ? "text-emerald-400" : "animate-pulse text-red-500"}>{plat ? "platform OK" : "move fully onto the platform · پوری گاڑی کانٹے پر لائیں"}</span>)}
        </div>
      </div>
      {d.state === "weighing" && (
        <div className="grid grid-cols-[auto_1fr] items-center gap-x-8 gap-y-3 rounded-3xl bg-white/5 px-8 py-6 text-4xl">
          <Plate no={d.vehicle_no} /><span className="text-slate-300">{d.vehicle_type}</span>
          <span className="text-2xl text-slate-400">Grower</span><span className="font-bold">{d.grower_name}</span>
          <span className="text-2xl text-slate-400">Now</span>
          <span className="font-bold text-amber-300">{d.stage === "Gross" ? "Gross · 1st weight (loaded)" : "Tare · 2nd weight (empty)"} <Ur className="inline-block text-3xl">{stageUr}</Ur></span>
          {d.stage === "Tare" && d.gross_kg ? <><span className="text-2xl text-slate-400">Gross</span><span className="tabular-nums">{kg(d.gross_kg)}</span></> : null}
        </div>
      )}
      {d.state === "done" && (
        <div className="rounded-3xl bg-emerald-500/15 px-8 py-6 text-center">
          <div className="text-3xl text-slate-300"><Plate no={d.vehicle_no} /> <span className="ml-3">{d.grower_name}</span></div>
          {d.stage === "Gross"
            ? <><div className="mt-4 text-7xl font-black text-emerald-400">Gross {kg(d.weight_kg)}</div><Ur className="text-4xl text-emerald-300">پہلا وزن ہو گیا — یارڈ میں جائیں</Ur></>
            : <><div className="mt-4 text-5xl text-slate-300">{kg(d.gross_kg)} − {kg(d.weight_kg)}</div>
              <div className="text-8xl font-black text-emerald-400">Net {kg(d.net_kg)}</div><Ur className="text-4xl text-emerald-300">{`خالص وزن — سی پی آر ${d.cpr ?? ""}`}</Ur></>}
        </div>
      )}
      {(!d.state || d.state === "idle") && <div className="text-center text-4xl text-slate-400">Drive on slowly and stop fully on the platform <Ur className="text-4xl">آہستہ چلائیں اور پوری گاڑی کانٹے پر روکیں</Ur></div>}
    </div>
  );
}

export function DisplayPage() {
  const [params] = useSearchParams();
  const screen = params.get("screen") ?? "";
  const { data, error } = useQuery({ queryKey: ["sc-display", screen], enabled: !!screen, refetchInterval: 1000,
    queryFn: () => get<Disp>("sugarcane.api.v1.counter.display", { screen }) });
  const isWb = screen.startsWith("wb:");
  return (
    <div className="flex min-h-screen flex-col gap-6 bg-slate-950 p-8 text-white">
      <header className="flex items-center gap-4 border-b border-white/10 pb-4 text-2xl">
        {isWb ? <Scale className="size-9 text-amber-400" /> : <Wallet className="size-9 text-amber-400" />}
        <span className="font-bold">{data?.company ?? "MicroMax Sugar Mills"}</span>
        <span className="text-slate-400">· {isWb ? data?.terminal?.terminal_name ?? screen.slice(3) : data?.counter?.display_title ?? screen.slice(8)}</span>
        <span className="ml-auto text-slate-300"><Clock /></span>
      </header>
      {!screen && <p className="text-3xl">Open this page as /sugar/display?screen=counter:Cash Counter 1 or ?screen=wb:WB-1 Gross</p>}
      {error && <p className="text-3xl text-red-400">Can't load the display — log in on this PC (<a className="underline" href="/sugar/login">/sugar/login</a>) with a cashier or weighbridge user.</p>}
      {data && (isWb ? <WeighScreen d={data} /> : <CounterScreen d={data} />)}
    </div>
  );
}

/** Which display to open on each display PC. */
export function DisplaysPage() {
  const { data: st } = useQuery({ queryKey: ["sc-counter-status"], queryFn: () => get<{ counters: { name: string }[] }>("sugarcane.api.v1.counter.status") });
  const { data: terms } = useQuery({ queryKey: ["sc-wb-terminals"],
    queryFn: () => get<{ name: string; terminal_name: string; allowed_operations: string }[]>("frappe.client.get_list",
      { doctype: "Weighbridge Terminal", fields: JSON.stringify(["name", "terminal_name", "allowed_operations"]), filters: JSON.stringify({ is_active: 1 }), limit_page_length: 50 }) });
  const Card = ({ screen, title, sub }: { screen: string; title: string; sub: string }) => (
    <a href={`/sugar/display?screen=${encodeURIComponent(screen)}`} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-2xl border bg-card p-4 shadow-sm hover:border-primary">
      <MonitorSmartphone className="size-6 text-primary" /><div><div className="font-semibold">{title}</div><div className="text-xs text-muted-foreground">{sub}</div></div>
      <ExternalLink className="ml-auto size-4 text-muted-foreground" /></a>
  );
  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
      <div><h1 className="text-2xl font-bold">Payee displays</h1>
        <p className="text-sm text-muted-foreground">Open one on the screen facing the driver / grower (full screen: F11). It follows the counter or weighbridge PC live.
          The display PC must be logged in as a cashier or weighbridge user. Back to <Link className="text-primary underline" to="/procurement/counter">cash counter</Link>.</p></div>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Cash counters</h2>
      <div className="grid gap-3 sm:grid-cols-2">{(st?.counters ?? []).map((c) => <Card key={c.name} screen={`counter:${c.name}`} title={c.name} sub="Bilties being paid, total, paid" />)}</div>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Weighbridges</h2>
      <div className="grid gap-3 sm:grid-cols-2">{(terms ?? []).map((t) => <Card key={t.name} screen={`wb:${t.name}`} title={t.terminal_name} sub={`${t.allowed_operations} · live weight, platform, vehicle, result`} />)}</div>
    </div>
  );
}
