import { GlossyIcon } from "@/components/ui/app-icon";
import { useEffect, useRef, useState } from "react";
import { useFrappeGetCall } from "frappe-react-sdk";
import { Activity, Clock, Database, Gauge, Layers, Lightbulb, MemoryStick, RefreshCw, Rows3, Server, Snail, Table2, Zap } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { getCall } from "@/services/frappe";
import { cn } from "@/utils/cn";

interface Status {
  took_ms: number;
  database: {
    engine?: string; version?: string; size?: number; tables?: number; rows?: number; connections?: number; max_used_connections?: number;
    max_connections?: number; slow_queries?: number; uptime?: number; queries_per_sec?: number; buffer_pool?: number;
    top_tables?: { name: string; size: number; rows: number }[]; error?: string;
  };
  server: {
    cpu_cores?: number; cpu_percent?: number; memory_percent?: number; memory_total?: number; memory_used?: number;
    disk_percent?: number; disk_total?: number; disk_used?: number; load_avg?: number[] | null; uptime?: number; error?: string;
  };
}

export const bytes = (n?: number) => {
  if (!n && n !== 0) return "—";
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0, v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : v >= 10 ? 1 : 2)} ${u[i]}`;
};
const duration = (s?: number) => {
  if (!s) return "—";
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
};
/** green → amber → red by load */
const color = (pct: number) => (pct >= 90 ? "#f43f5e" : pct >= 75 ? "#f59e0b" : "#10b981");
const PALETTE = ["#6366f1", "#0ea5e9", "#8b5cf6", "#14b8a6", "#f59e0b", "#94a3b8"];

/** 0–100 overall health from load, space and database tuning. */
function healthOf(s?: Status) {
  if (!s) return null;
  const { database: db, server: srv } = s;
  let score = 100;
  const pen = (v: number | undefined, warn: number, bad: number, a: number, b: number) => { if ((v ?? 0) >= bad) score -= b; else if ((v ?? 0) >= warn) score -= a; };
  pen(srv.cpu_percent, 75, 90, 8, 18);
  pen(srv.memory_percent, 80, 92, 8, 18);
  pen(srv.disk_percent, 80, 92, 10, 25);
  pen(db.max_connections ? ((db.connections ?? 0) / db.max_connections) * 100 : 0, 70, 90, 8, 15);
  if (db.size && db.buffer_pool && db.buffer_pool < db.size * 0.25) score -= 12;
  if ((db.slow_queries ?? 0) / Math.max(1, (db.uptime ?? 0) / 3600) > 1) score -= 8;
  score = Math.max(0, Math.min(100, Math.round(score)));
  return { score, label: score >= 85 ? "Healthy" : score >= 65 ? "Needs attention" : "Critical", color: score >= 85 ? "#10b981" : score >= 65 ? "#f59e0b" : "#f43f5e" };
}

function useStatus() {
  const [refresh, setRefresh] = useState(0);
  const res = useFrappeGetCall<{ message: Status }>("mm_core.system_status.get_status", { refresh: refresh ? 1 : 0 },
    `mm_core.system_status.${refresh}`, { revalidateOnFocus: false, dedupingInterval: 60_000 });
  return { ...res, status: (res.data as unknown as { message?: Status })?.message, reload: () => setRefresh((r) => r + 1) };
}

/** API round-trips every 2 s while the panel is open (last 30). */
function useLatency(active: boolean) {
  const [samples, setSamples] = useState<number[]>([]);
  const alive = useRef(active);
  alive.current = active;
  useEffect(() => {
    if (!active) return;
    let stop = false;
    const tick = async () => {
      const t = performance.now();
      try { await getCall("frappe.auth.get_logged_user"); } catch { /* still a round trip */ }
      if (!stop) setSamples((p) => [...p.slice(-29), Math.round(performance.now() - t)]);
    };
    void tick();
    const id = window.setInterval(() => void tick(), 2000);
    return () => { stop = true; window.clearInterval(id); };
  }, [active]);
  return samples;
}

// ------------------------------------------------------------------ graphics
function Ring({ pct, size = 112, stroke = 10, stroke2, children, track = "hsl(var(--muted))", c }: { pct: number; size?: number; stroke?: number; stroke2?: string; children?: React.ReactNode; track?: string; c?: string }) {
  const r = (size - stroke) / 2, circ = 2 * Math.PI * r, v = Math.max(0, Math.min(100, pct));
  const col = c ?? color(v);
  const id = `g${Math.round(v)}${size}${col.replace("#", "")}`;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={col} stopOpacity="0.55" />
            <stop offset="100%" stopColor={stroke2 ?? col} />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={`url(#${id})`} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={circ * (1 - v / 100)} style={{ transition: "stroke-dashoffset .8s ease" }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  );
}

function GaugeTile({ icon: Icon, label, pct, value, sub }: { icon: React.ComponentType<{ className?: string }>; label: string; pct: number; value: string; sub: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-card/60 p-4">
      <Ring pct={pct} size={96} stroke={9}>
        <span className="text-lg font-semibold tabular-nums" style={{ color: color(pct) }}>{Math.round(pct)}%</span>
      </Ring>
      <div className="text-center">
        <div className="flex items-center justify-center gap-1.5 text-xs font-semibold"><Icon className="h-3.5 w-3.5 text-muted-foreground" />{label}</div>
        <div className="text-[11px] tabular-nums text-foreground">{value}</div>
        <div className="text-[10px] text-muted-foreground">{sub}</div>
      </div>
    </div>
  );
}

function Donut({ parts, total }: { parts: { label: string; value: number; color: string }[]; total: number }) {
  const size = 150, stroke = 22, r = (size - stroke) / 2, circ = 2 * Math.PI * r;
  let offset = 0;
  return (
    <svg width={size} height={size} className="-rotate-90 shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth={stroke} />
      {parts.map((p) => {
        const len = (p.value / Math.max(1, total)) * circ;
        const el = <circle key={p.label} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={p.color} strokeWidth={stroke}
          strokeDasharray={`${Math.max(0, len - 2)} ${circ}`} strokeDashoffset={-offset}><title>{`${p.label}: ${bytes(p.value)}`}</title></circle>;
        offset += len;
        return el;
      })}
    </svg>
  );
}

function Sparkline({ data }: { data: number[] }) {
  const w = 280, h = 64;
  if (data.length < 2) return <div className="flex h-16 items-center justify-center text-[11px] text-muted-foreground">Measuring…</div>;
  const max = Math.max(...data) * 1.15, min = 0;
  const pts = data.map((v, i) => [(i / (data.length - 1)) * w, h - ((v - min) / (max - min || 1)) * h] as const);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-16 w-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id="spark" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#6366f1" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L${w},${h} L0,${h} Z`} fill="url(#spark)" />
      <path d={line} fill="none" stroke="#6366f1" strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <circle cx={last[0]} cy={last[1]} r="3.5" fill="#6366f1" className="animate-pulse" />
    </svg>
  );
}

function Stat({ icon: Icon, label, value, tone }: { icon: React.ComponentType<{ className?: string }>; label: string; value: React.ReactNode; tone?: string }) {
  return (
    <div className="rounded-xl bg-muted/40 p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"><Icon className="h-3 w-3" />{label}</div>
      <div className={cn("mt-0.5 text-sm font-semibold tabular-nums", tone)}>{value}</div>
    </div>
  );
}

// ------------------------------------------------------------------ card + panel
/** Overview card (System Managers): health score ring + database size; opens the System Status panel. */
export function SystemStatusCard() {
  const [open, setOpen] = useState(false);
  const s = useStatus();
  const db = s.status?.database;
  const h = healthOf(s.status);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} title="System status"
        className="group flex w-full flex-col items-center gap-1.5 rounded-2xl p-2 text-center outline-none focus-visible:ring-2 focus-visible:ring-primary">
        <GlossyIcon icon={Database} hue="sky" badge={h ? (
          <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-background px-1 text-[10px] font-bold tabular-nums shadow ring-2" style={{ color: h.color, ["--tw-ring-color" as string]: h.color }}>{h.score}</span>
        ) : undefined} />
        <span className="w-full truncate text-[13px] font-semibold leading-tight">Database</span>
        <span className="-mt-1 w-full truncate text-[10px] text-muted-foreground">
          {db?.size ? <><span className="font-semibold text-foreground">{bytes(db.size)}</span> · {db.tables?.toLocaleString()} tables</> : s.isLoading ? "Checking…" : "System Status"}
        </span>
      </button>
      <SystemStatusDialog open={open} onClose={() => setOpen(false)} s={s} />
    </>
  );
}

function SystemStatusDialog({ open, onClose, s }: { open: boolean; onClose: () => void; s: ReturnType<typeof useStatus> }) {
  const db = s.status?.database ?? {};
  const srv = s.status?.server ?? {};
  const h = healthOf(s.status);
  const lat = useLatency(open);
  const latAvg = lat.length ? Math.round(lat.reduce((a, b) => a + b, 0) / lat.length) : null;
  const latLast = lat[lat.length - 1];

  const top = db.top_tables ?? [];
  const topSum = top.reduce((a, t) => a + t.size, 0);
  const parts = [...top.map((t, i) => ({ label: t.name.replace(/^tab/, ""), value: t.size, color: PALETTE[i] })),
    ...(db.size && db.size > topSum ? [{ label: "Everything else", value: db.size - topSum, color: PALETTE[5] }] : [])];
  const connPct = db.max_connections ? ((db.connections ?? 0) / db.max_connections) * 100 : 0;

  const tips: string[] = [];
  if (db.size && db.buffer_pool && db.buffer_pool < db.size * 0.25)
    tips.push(`InnoDB buffer pool is ${bytes(db.buffer_pool)} for a ${bytes(db.size)} database — raise innodb_buffer_pool_size (≈ ${bytes(Math.min(db.size, (srv.memory_total ?? 0) * 0.4))}) so more of it stays in memory.`);
  if ((db.slow_queries ?? 0) > 0) tips.push(`${db.slow_queries} slow queries in ${duration(db.uptime)} — usually heavy reports or missing indexes.`);
  if ((srv.disk_percent ?? 0) >= 80) tips.push(`Disk is ${srv.disk_percent}% full — clear old backups (sites/<site>/private/backups).`);
  if ((srv.memory_percent ?? 0) >= 85) tips.push(`Memory is ${srv.memory_percent}% used.`);

  return (
    <Dialog open={open} onClose={onClose} title="System Status" size="xl">
      <div className="space-y-4">
        {/* hero: health score */}
        <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-indigo-500/10 via-sky-500/5 to-emerald-500/10 p-5">
          <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-indigo-500/10 blur-2xl" />
          <div className="flex flex-wrap items-center gap-5">
            <Ring pct={h?.score ?? 0} size={120} stroke={11} c={h?.color} stroke2={h?.color}>
              <span className="text-3xl font-bold tabular-nums" style={{ color: h?.color }}>{h?.score ?? "–"}</span>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">health</span>
            </Ring>
            <div className="min-w-0 flex-1 space-y-2">
              <div className="text-xl font-semibold" style={{ color: h?.color }}>{h?.label ?? "Checking…"}</div>
              <div className="text-xs text-muted-foreground">{db.engine} {db.version}</div>
              <div className="flex flex-wrap gap-1.5 text-[11px]">
                <span className="rounded-full bg-background/70 px-2.5 py-1"><Database className="mr-1 inline h-3 w-3" />{bytes(db.size)}</span>
                <span className="rounded-full bg-background/70 px-2.5 py-1"><Clock className="mr-1 inline h-3 w-3" />DB up {duration(db.uptime)}</span>
                <span className="rounded-full bg-background/70 px-2.5 py-1"><Server className="mr-1 inline h-3 w-3" />Server up {duration(srv.uptime)}</span>
                <span className="rounded-full bg-background/70 px-2.5 py-1"><Zap className="mr-1 inline h-3 w-3" />{db.queries_per_sec ?? "—"} queries/s</span>
              </div>
            </div>
            <Button size="sm" variant="outline" className="self-start" onClick={s.reload} disabled={s.isValidating}>
              <RefreshCw className={cn("h-3.5 w-3.5", s.isValidating && "animate-spin")} /> Refresh
            </Button>
          </div>
        </div>
        {db.error || srv.error ? <p className="text-xs text-destructive">{db.error || srv.error}</p> : null}

        {/* gauges */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <GaugeTile icon={Gauge} label="CPU" pct={srv.cpu_percent ?? 0} value={`${srv.cpu_cores ?? "—"} cores`} sub={`load ${srv.load_avg?.[0] ?? "—"}`} />
          <GaugeTile icon={MemoryStick} label="Memory" pct={srv.memory_percent ?? 0} value={`${bytes(srv.memory_used)} used`} sub={`of ${bytes(srv.memory_total)}`} />
          <GaugeTile icon={Layers} label="Disk" pct={srv.disk_percent ?? 0} value={`${bytes(srv.disk_used)} used`} sub={`of ${bytes(srv.disk_total)}`} />
          <GaugeTile icon={Activity} label="Connections" pct={connPct} value={`${db.connections ?? "—"} open`} sub={`peak ${db.max_used_connections ?? "—"} / ${db.max_connections ?? "—"}`} />
        </div>

        <div className="grid gap-3 md:grid-cols-5">
          {/* storage donut */}
          <section className="rounded-2xl border border-border p-4 md:col-span-3">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Table2 className="h-4 w-4 text-indigo-500" /> Where the space goes</h3>
            <div className="flex flex-wrap items-center gap-5">
              <div className="relative">
                <Donut parts={parts} total={db.size ?? 1} />
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-lg font-semibold tabular-nums">{bytes(db.size)}</span>
                  <span className="text-[10px] text-muted-foreground">{db.tables?.toLocaleString()} tables</span>
                </div>
              </div>
              <ul className="min-w-0 flex-1 space-y-1.5">
                {parts.map((p) => (
                  <li key={p.label} className="flex items-center gap-2 text-xs">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: p.color }} />
                    <span className="min-w-0 flex-1 truncate">{p.label}</span>
                    <span className="tabular-nums text-muted-foreground">{bytes(p.value)}</span>
                    <span className="w-10 text-right tabular-nums font-medium">{db.size ? Math.round((p.value / db.size) * 100) : 0}%</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {/* live response + db stats */}
          <section className="space-y-3 rounded-2xl border border-border p-4 md:col-span-2">
            <div className="flex items-baseline justify-between">
              <h3 className="flex items-center gap-2 text-sm font-semibold"><Zap className="h-4 w-4 text-indigo-500" /> Live response</h3>
              <span className="text-[10px] text-muted-foreground">every 2 s</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-semibold tabular-nums" style={{ color: latLast ? color(Math.min(100, latLast / 10)) : undefined }}>{latLast ?? "—"}</span>
              <span className="text-xs text-muted-foreground">ms now · avg {latAvg ?? "—"} ms · peak {lat.length ? Math.max(...lat) : "—"} ms</span>
            </div>
            <Sparkline data={lat} />
            <div className="grid grid-cols-2 gap-2">
              <Stat icon={Rows3} label="Rows" value={db.rows ? `${(db.rows / 1e6).toFixed(2)} M` : "—"} />
              <Stat icon={Snail} label="Slow queries" value={db.slow_queries ?? "—"} tone={db.slow_queries ? "text-amber-600 dark:text-amber-400" : undefined} />
              <Stat icon={MemoryStick} label="Buffer pool" value={bytes(db.buffer_pool)} tone={db.size && db.buffer_pool && db.buffer_pool < db.size * 0.25 ? "text-amber-600 dark:text-amber-400" : undefined} />
              <Stat icon={Zap} label="Queries / sec" value={db.queries_per_sec ?? "—"} />
            </div>
          </section>
        </div>

        {tips.length > 0 && (
          <ul className="space-y-1.5 rounded-2xl border border-amber-500/30 bg-amber-500/[0.07] p-3 text-xs">
            {tips.map((t) => <li key={t} className="flex gap-2"><Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />{t}</li>)}
          </ul>
        )}
      </div>
    </Dialog>
  );
}
