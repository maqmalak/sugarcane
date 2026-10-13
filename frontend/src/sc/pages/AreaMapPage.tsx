/** Area Map: pins and boundaries for Division → District → Zone → Circle → Sector → Village. */
import type { FeatureCollection } from "geojson";
import { useFrappeGetCall, useFrappePostCall } from "frappe-react-sdk";
import { ChevronDown, ChevronRight, ExternalLink, MapPin, Pentagon, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { LocationCapture, type CaptureResult } from "@/sc/components/map/LocationCapture";
import { Badge } from "@/sc/components/ui/badge";
import { Input } from "@/sc/components/ui/input";
import { Empty, Skeleton } from "@/sc/components/ui/skeleton";
import { fmtAcres, toGeometries, type LngLat } from "@/sc/lib/map";
import { cn } from "@/sc/lib/utils";

interface Node {
  doctype: string;
  name: string;
  title: string;
  code?: string | null;
  parent_doctype?: string | null;
  parent?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  area_acres?: number | null;
  has_boundary: number;
  can_write: boolean;
}

interface Detail {
  doctype: string;
  name: string;
  title: string;
  latitude?: number | null;
  longitude?: number | null;
  polygon?: string | null;
  area_acres?: number | null;
  can_write: boolean;
  parent?: { doctype: string; name: string; polygon: FeatureCollection } | null;
  children: FeatureCollection;
}

const LEVEL_LABEL: Record<string, string> = {
  "Sugar Settings": "Company mill", "Competitor Mill": "Competitor mill", "Sugar Division": "Division", "Sugar District": "District", "Sugar Zone": "Zone", "Cane Circle": "Circle",
  "Cane Sector": "Sector", "Cane Village": "Village",
};
const LEVEL_TONE = { "Sugar Settings": "blue", "Competitor Mill": "red", "Sugar Division": "violet", "Sugar District": "blue", "Sugar Zone": "orange", "Cane Circle": "green", "Cane Sector": "amber", "Cane Village": "gray" } as const;
const key = (dt: string, name: string) => `${dt}::${name}`;

export function AreaMapPage() {
  const [params, setParams] = useSearchParams();
  const selected = params.get("doctype") && params.get("name") ? { doctype: params.get("doctype")!, name: params.get("name")! } : null;
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Set<string>>(new Set());
  const { data: treeData, isLoading, mutate: refreshTree } = useFrappeGetCall<{ message: Node[] }>("sugarcane.api.v1.survey_map.geo_tree", undefined, "geo-tree");
  const nodes = useMemo(() => treeData?.message ?? [], [treeData]);

  const children = useMemo(() => {
    const m = new Map<string, Node[]>();
    for (const n of nodes) {
      const k = n.parent && n.parent_doctype ? key(n.parent_doctype, n.parent) : "root";
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(n);
    }
    return m;
  }, [nodes]);

  const matches = useMemo(() => {
    if (!q.trim()) return null;
    const t = q.toLowerCase();
    return nodes.filter((n) => n.title.toLowerCase().includes(t) || n.name.toLowerCase().includes(t)).slice(0, 80);
  }, [nodes, q]);

  const stats = useMemo(() => {
    const by: Record<string, { n: number; pin: number; poly: number }> = {};
    for (const n of nodes) {
      const s = (by[n.doctype] ??= { n: 0, pin: 0, poly: 0 });
      s.n += 1;
      if (n.latitude && n.longitude) s.pin += 1;
      if (n.has_boundary) s.poly += 1;
    }
    return by;
  }, [nodes]);

  const select = (n: Node) => setParams({ doctype: n.doctype, name: n.name });
  const toggle = (k: string) => setOpen((prev) => { const s = new Set(prev); if (s.has(k)) s.delete(k); else s.add(k); return s; });

  const renderNode = (n: Node, depth: number) => {
    const k = key(n.doctype, n.name);
    const kids = children.get(k) ?? [];
    const isOpen = open.has(k);
    const active = selected?.doctype === n.doctype && selected?.name === n.name;
    return (
      <div key={k}>
        <div className={cn("group flex items-center gap-1 rounded-md pr-2 text-sm", active ? "bg-primary/10 text-primary" : "hover:bg-muted")}
          style={{ paddingLeft: depth * 14 + 4 }}>
          <button type="button" className="grid size-6 place-items-center text-muted-foreground" onClick={() => toggle(k)} disabled={!kids.length}
            aria-label={isOpen ? "Collapse" : "Expand"}>
            {kids.length ? (isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />) : <span className="size-1.5 rounded-full bg-border" />}
          </button>
          <button type="button" onClick={() => select(n)} className="flex min-w-0 flex-1 items-center gap-1.5 py-1.5 text-left">
            <span className="truncate">{n.title}</span>
            {n.code && <span className="font-mono text-[10px] text-muted-foreground">{n.code}</span>}
          </button>
          <MapPin className={cn("size-3.5 shrink-0", n.latitude && n.longitude ? "text-rose-500" : "text-muted-foreground/30")} aria-label="Pin" />
          <Pentagon className={cn("size-3.5 shrink-0", n.has_boundary ? "text-emerald-600" : "text-muted-foreground/30")} aria-label="Boundary" />
        </div>
        {isOpen && kids.map((c) => renderNode(c, depth + 1))}
      </div>
    );
  };

  return (
    <div className="mx-auto grid max-w-[1500px] gap-4 lg:grid-cols-[340px_1fr]">
      <aside className="form-card flex max-h-[calc(100vh-7.5rem)] flex-col">
        <div className="form-card-head">Area hierarchy</div>
        <div className="space-y-2 border-b p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-3 size-4 text-muted-foreground" />
            <Input className="pl-8" placeholder="Find a zone, circle, village…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="flex flex-wrap gap-1">
            {Object.entries(LEVEL_LABEL).map(([dt, label]) => stats[dt] && (
              <span key={dt} className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground" title={`${stats[dt].pin} with pin, ${stats[dt].poly} with boundary`}>
                {label} {stats[dt].poly}/{stats[dt].n}
              </span>
            ))}
          </div>
        </div>
        <div className="scrollbar-thin flex-1 overflow-y-auto p-2">
          {isLoading && Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="mb-1 h-7" />)}
          {matches
            ? matches.map((n) => (
              <button key={key(n.doctype, n.name)} type="button" onClick={() => select(n)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted">
                <Badge tone={LEVEL_TONE[n.doctype as keyof typeof LEVEL_TONE] ?? "gray"}>{LEVEL_LABEL[n.doctype]}</Badge>
                <span className="truncate">{n.title}</span>
              </button>
            ))
            : (children.get("root") ?? []).map((n) => renderNode(n, 0))}
          {!isLoading && !nodes.length && <Empty title="No area masters yet" hint="Create divisions, zones and circles on the Desk first." />}
        </div>
      </aside>

      <section className="min-w-0">
        {selected ? <Editor key={key(selected.doctype, selected.name)} doctype={selected.doctype} name={selected.name} onSaved={() => refreshTree()} />
          : <Empty title="Pick an area on the left" hint="Each level has a pin and a boundary. The parent's boundary is shown dashed in yellow." />}
      </section>
    </div>
  );
}

function Editor({ doctype, name, onSaved }: { doctype: string; name: string; onSaved: () => void }) {
  const { data, isLoading, mutate } = useFrappeGetCall<{ message: Detail }>("sugarcane.api.v1.survey_map.geo_feature", { doctype, name });
  const { call, loading } = useFrappePostCall("sugarcane.api.v1.survey_map.save_geo");
  const d = data?.message;
  const pin: LngLat | null = d?.latitude && d?.longitude ? [d.longitude, d.latitude] : null;
  const ownBoundary: FeatureCollection | null = d?.polygon ? { type: "FeatureCollection", features: toGeometries(d.polygon).map((g) => ({ type: "Feature", geometry: g, properties: {} })) } : null;

  const save = async (r: CaptureResult, what: "pin" | "boundary") => {
    try {
      const args: Record<string, unknown> = { doctype, name };
      if (what === "pin" && r.point) { args.longitude = r.point[0]; args.latitude = r.point[1]; }
      if (what === "boundary" && r.geometry) args.polygon = JSON.stringify(r.geometry);
      const res = await call(args);
      toast.success(what === "pin" ? "Pin saved" : `Boundary saved · ${fmtAcres(res.message.area_acres ?? 0)}`);
      await mutate();
      onSaved();
    } catch (e) {
      toast.error((e as { message?: string })?.message ?? "Could not save");
    }
  };

  if (isLoading || !d) return <Skeleton className="h-[34rem]" />;
  const context: FeatureCollection = { type: "FeatureCollection", features: [...d.children.features, ...(ownBoundary?.features ?? [])] };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={LEVEL_TONE[doctype as keyof typeof LEVEL_TONE] ?? "gray"}>{LEVEL_LABEL[doctype]}</Badge>
        <h1 className="text-xl font-semibold">{d.title}</h1>
        {d.title !== d.name && <span className="font-mono text-xs text-muted-foreground">{d.name}</span>}
        {!!d.area_acres && <span className="text-sm text-muted-foreground">· {fmtAcres(d.area_acres)}</span>}
        <a className="ml-auto inline-flex items-center gap-1 text-sm text-primary hover:underline"
          href={doctype === "Sugar Settings" ? "/app/sugar-settings" : `/app/${doctype.toLowerCase().replace(/ /g, "-")}/${encodeURIComponent(name)}`}>
          <ExternalLink className="size-4" />Open in Desk
        </a>
      </div>
      {!d.can_write && <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">You can view this area but not change it.</p>}
      <div className="grid gap-4 2xl:grid-cols-2">
        <LocationCapture mode="shape" title={`${LEVEL_LABEL[doctype]} boundary`} initialGeometry={d.polygon} parent={d.parent?.polygon}
          context={d.children} readOnly={!d.can_write} busy={loading} onApply={(r) => save(r, "boundary")} />
        <LocationCapture mode="point" title={`${LEVEL_LABEL[doctype]} pin`} initialPoint={pin} parent={d.parent?.polygon}
          context={context} readOnly={!d.can_write} busy={loading} onApply={(r) => save(r, "pin")} />
      </div>
      <p className="text-xs text-muted-foreground">
        Saving checks the boundary, measures it on the WGS84 ellipsoid and warns when it sticks out of {d.parent ? `${LEVEL_LABEL[d.parent.doctype]} ${d.parent.name}` : "its parent"}.
        A pin left empty is set inside the boundary automatically.
      </p>
    </div>
  );
}
