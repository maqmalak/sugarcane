import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { Briefcase, Building2, Crosshair, Factory, GitBranch, Loader2, MapPin, MapPinOff, Pencil, Plus, Search, Store, Trash2, Users2, Building, UtensilsCrossed, Warehouse, type LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { KpiGrid } from "@/components/doc/dashboard-kit";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { BranchMap, type MapPoint } from "@/components/hr/branch-map";
import { useAggregate, useDocList, useDocMutations, count } from "@/hooks/useDoc";
import { useCompanyContext, companyFilter } from "@/hooks/useCompanyContext";
import { notifyDataChanged } from "@/hooks/useRealtime";
import { humanizeError } from "@/services/frappe";
import { asNumber, cn } from "@/utils/cn";

interface BranchRow {
  name: string;
  branch?: string;
  branch_address?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  mm_branch_type?: string;
}

/** Branch Type (custom field Branch.mm_branch_type): icon, colours and map-pin emoji. */
export const BRANCH_TYPES: Record<string, { icon: LucideIcon; soft: string; pin: string; emoji: string }> = {
  "Head Office": { icon: Building2, soft: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400", pin: "#6366f1", emoji: "🏢" },
  Factory: { icon: Factory, soft: "bg-amber-500/15 text-amber-600 dark:text-amber-400", pin: "#d97706", emoji: "🏭" },
  Warehouse: { icon: Warehouse, soft: "bg-sky-500/15 text-sky-600 dark:text-sky-400", pin: "#0284c7", emoji: "📦" },
  Restaurant: { icon: UtensilsCrossed, soft: "bg-orange-500/15 text-orange-600 dark:text-orange-400", pin: "#ea580c", emoji: "🍽️" },
  "Shop / Outlet": { icon: Store, soft: "bg-pink-500/15 text-pink-600 dark:text-pink-400", pin: "#db2777", emoji: "🏬" },
  Office: { icon: Briefcase, soft: "bg-violet-500/15 text-violet-600 dark:text-violet-400", pin: "#7c3aed", emoji: "💼" },
};

type Draft = { branch: string; branch_address: string; city: string; latitude: string; longitude: string; mm_branch_type: string };
const EMPTY: Draft = { branch: "", branch_address: "", city: "", latitude: "", longitude: "", mm_branch_type: "" };

const hasCoords = (b: { latitude?: unknown; longitude?: unknown }) =>
  b.latitude !== undefined && b.latitude !== null && b.latitude !== "" && b.longitude !== undefined && b.longitude !== null && b.longitude !== "" &&
  !(Number(b.latitude) === 0 && Number(b.longitude) === 0) && Math.abs(Number(b.latitude)) <= 90 && Math.abs(Number(b.longitude)) <= 180;

/** Branch editor: name, address and a map pin set by clicking the map, GPS, or an address lookup. */
function BranchDialog({
  open,
  editing,
  onClose,
  onSaved,
}: {
  open: boolean;
  editing: BranchRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [seeded, setSeeded] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState<"gps" | "address" | null>(null);
  const { createDoc, updateDoc } = useDocMutations("Branch");

  const key = open ? editing?.name ?? "__new" : null;
  if (key !== seeded) {
    setSeeded(key);
    setDraft(
      editing
        ? {
            branch: editing.branch ?? editing.name,
            branch_address: editing.branch_address ?? "",
            city: editing.city ?? "",
            latitude: hasCoords(editing) ? String(editing.latitude) : "",
            longitude: hasCoords(editing) ? String(editing.longitude) : "",
            mm_branch_type: editing.mm_branch_type ?? "",
          }
        : EMPTY,
    );
  }

  const set = (k: keyof Draft, v: string) => setDraft((d) => ({ ...d, [k]: v }));
  const setPoint = (lat: number, lng: number) => setDraft((d) => ({ ...d, latitude: lat.toFixed(6), longitude: lng.toFixed(6) }));
  const point: MapPoint[] = hasCoords(draft)
    ? [{ id: "draft", lat: Number(draft.latitude), lng: Number(draft.longitude), title: draft.branch || "New branch", subtitle: draft.city, kind: draft.mm_branch_type }]
    : [];

  const useMyLocation = () => {
    if (!navigator.geolocation) return toast.error("This browser cannot share its location.");
    setLocating("gps");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPoint(pos.coords.latitude, pos.coords.longitude);
        setLocating(null);
      },
      (err) => {
        toast.error(err.message || "Could not read your location.");
        setLocating(null);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  // OpenStreetMap's Nominatim geocoder — only called when the user clicks "Find on map".
  const findAddress = async () => {
    const q = [draft.branch_address, draft.city].filter(Boolean).join(", ");
    if (!q) return toast.error("Enter an address or city first.");
    setLocating("address");
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`, {
        headers: { Accept: "application/json" },
      });
      const hits = (await res.json()) as { lat: string; lon: string }[];
      if (!hits.length) toast.error("Address not found — click the map to place the pin instead.");
      else setPoint(Number(hits[0].lat), Number(hits[0].lon));
    } catch {
      toast.error("Address lookup failed — click the map to place the pin instead.");
    } finally {
      setLocating(null);
    }
  };

  const save = async () => {
    if (!draft.branch.trim()) return toast.error("Branch name is required.");
    const lat = draft.latitude === "" ? null : Number(draft.latitude);
    const lng = draft.longitude === "" ? null : Number(draft.longitude);
    if ((lat !== null && (Number.isNaN(lat) || Math.abs(lat) > 90)) || (lng !== null && (Number.isNaN(lng) || Math.abs(lng) > 180))) {
      return toast.error("Latitude must be between -90 and 90, longitude between -180 and 180.");
    }
    const values = { branch_address: draft.branch_address, city: draft.city, latitude: lat ?? 0, longitude: lng ?? 0, mm_branch_type: draft.mm_branch_type };
    setSaving(true);
    try {
      if (editing) await updateDoc(editing.name, values);
      else await createDoc({ branch: draft.branch.trim(), ...values });
      toast.success(editing ? "Branch updated" : "Branch created");
      notifyDataChanged();
      onSaved();
      onClose();
    } catch (e) {
      toast.error(humanizeError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title={editing ? `Edit ${editing.branch ?? editing.name}` : "New Branch"} description="Click the map to drop the pin, or use GPS / address lookup." size="xl">
      <div className="grid gap-5 md:grid-cols-5">
        <div className="space-y-3 md:col-span-2">
          <div>
            <Label required>Branch</Label>
            <Input value={draft.branch} onChange={(e) => set("branch", e.target.value)} disabled={!!editing} placeholder="e.g. Faisalabad Mill" />
            {editing && <p className="mt-1 text-xs text-muted-foreground">The name is the branch ID and can't be changed here.</p>}
          </div>
          <div>
            <Label>Branch type</Label>
            <div className="mt-1 grid grid-cols-3 gap-1.5">
              {Object.entries(BRANCH_TYPES).map(([t, cfg]) => (
                <button key={t} type="button" onClick={() => set("mm_branch_type", draft.mm_branch_type === t ? "" : t)} aria-pressed={draft.mm_branch_type === t}
                  className={cn("flex flex-col items-center gap-1 rounded-xl border p-2 text-[11px] font-semibold transition-colors",
                    draft.mm_branch_type === t ? "border-primary bg-primary/10 text-primary ring-2 ring-primary/20" : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground")}>
                  <span className={cn("flex h-8 w-8 items-center justify-center rounded-lg", cfg.soft)}><cfg.icon className="h-4 w-4" /></span>{t}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label>Address</Label>
            <Textarea rows={3} value={draft.branch_address} onChange={(e) => set("branch_address", e.target.value)} placeholder="Street, area" />
          </div>
          <div>
            <Label>City</Label>
            <Input value={draft.city} onChange={(e) => set("city", e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Latitude</Label>
              <Input inputMode="decimal" value={draft.latitude} onChange={(e) => set("latitude", e.target.value)} placeholder="31.418700" />
            </div>
            <div>
              <Label>Longitude</Label>
              <Input inputMode="decimal" value={draft.longitude} onChange={(e) => set("longitude", e.target.value)} placeholder="73.079100" />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={useMyLocation} disabled={!!locating}>
              {locating === "gps" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crosshair className="h-4 w-4" />} My location
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => void findAddress()} disabled={!!locating}>
              {locating === "address" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Find on map
            </Button>
            {hasCoords(draft) && (
              <Button type="button" variant="ghost" size="sm" onClick={() => setDraft((d) => ({ ...d, latitude: "", longitude: "" }))}>
                <MapPinOff className="h-4 w-4" /> Clear pin
              </Button>
            )}
          </div>
        </div>
        <div className="md:col-span-3">
          <BranchMap points={point} selectedId="draft" onPick={setPoint} className="h-[340px] border border-border md:h-full md:min-h-[360px]" />
        </div>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={() => void save()} loading={saving}>{editing ? "Save Changes" : "Create"}</Button>
      </div>
    </Dialog>
  );
}

export default function BranchesPage() {
  const { company } = useCompanyContext();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string>();
  const [dialog, setDialog] = useState<{ open: boolean; editing: BranchRow | null }>({ open: false, editing: null });
  const [toDelete, setToDelete] = useState<BranchRow | null>(null);
  const { deleteDoc, loading: deleting } = useDocMutations("Branch");

  const { data, isLoading, error, mutate } = useDocList<BranchRow>("Branch", {
    fields: ["name", "branch", "branch_address", "city", "latitude", "longitude", "mm_branch_type"],
    orderBy: { field: "name", order: "asc" },
    limit: 1000,
  });
  const empFilters = useMemo(() => [...companyFilter(company), ["status", "=", "Active"]], [company]);
  const { data: heads } = useAggregate("Employee", { fields: ["branch", count("name", "n")], filters: empFilters, groupBy: "branch" });
  const headcount: Record<string, number> = Object.fromEntries((heads ?? []).map((r) => [r.branch ?? "", asNumber(r.n)]));

  const branches = data ?? [];
  const rows = branches.filter((b) => {
    const q = search.trim().toLowerCase();
    return !q || [b.name, b.city, b.branch_address].some((v) => (v ?? "").toLowerCase().includes(q));
  });
  const mapped = branches.filter(hasCoords);
  const points: MapPoint[] = rows.filter(hasCoords).map((b) => ({
    id: b.name,
    lat: Number(b.latitude),
    lng: Number(b.longitude),
    title: b.branch || b.name,
    subtitle: [b.city, `${headcount[b.name] ?? 0} employees`].filter(Boolean).join(" · "),
    weight: headcount[b.name] ?? 0,
    kind: b.mm_branch_type,
  }));
  const totalStaff = branches.reduce((s, b) => s + (headcount[b.name] ?? 0), 0);
  const unassigned = headcount[""] ?? 0;
  const cities = new Set(branches.map((b) => b.city?.trim()).filter(Boolean)).size;

  const remove = async () => {
    if (!toDelete) return;
    try {
      await deleteDoc(toDelete.name);
      toast.success("Branch deleted");
      setToDelete(null);
      if (selected === toDelete.name) setSelected(undefined);
      void mutate();
      notifyDataChanged();
    } catch (e) {
      toast.error(humanizeError(e));
      setToDelete(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Branches"
        subtitle="Company branches and office locations, on the map"
        icon={<GitBranch className="h-5 w-5" />}
        actions={
          <Button variant="primary" onClick={() => setDialog({ open: true, editing: null })}>
            <Plus className="h-4 w-4" /> New Branch
          </Button>
        }
      />

      <KpiGrid
        className="xl:grid-cols-4"
        items={[
          { label: "Branches", value: branches.length, icon: <GitBranch className="h-4 w-4" />, tone: "sky" },
          { label: "On the map", value: `${mapped.length} / ${branches.length}`, icon: <MapPin className="h-4 w-4" />, tone: mapped.length === branches.length ? "emerald" : "amber" },
          { label: "Active staff in branches", value: totalStaff, icon: <Users2 className="h-4 w-4" />, tone: "indigo", valueSuffix: unassigned ? `+${unassigned} unassigned` : undefined },
          { label: "Cities", value: cities, icon: <Building className="h-4 w-4" />, tone: "teal" },
        ]}
      />

      {error && (
        <Card className="border-amber-500/40 bg-amber-500/5 p-4 text-sm">
          Could not load branch locations: {humanizeError(error)}. If this mentions an unknown column, run <code className="rounded bg-muted px-1">bench migrate</code> so the Branch location fields are added.
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="overflow-hidden p-0 lg:col-span-3">
          <BranchMap points={points} selectedId={selected} onSelect={setSelected} className="h-[420px] rounded-none lg:h-[560px]" />
        </Card>

        <Card className="flex flex-col overflow-hidden p-0 lg:col-span-2 lg:h-[560px]">
          <div className="border-b border-border p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search branch, city or address…" className="pl-8" />
            </div>
          </div>
          <ul className="flex-1 divide-y divide-border overflow-y-auto">
            {isLoading &&
              Array.from({ length: 4 }).map((_, i) => (
                <li key={i} className="p-4">
                  <Skeleton className="h-12 w-full" />
                </li>
              ))}
            {rows.map((b) => {
              const n = headcount[b.name] ?? 0;
              const pinned = hasCoords(b);
              return (
                <li
                  key={b.name}
                  onClick={() => pinned && setSelected(b.name)}
                  className={cn("group flex gap-3 p-4 transition-colors", pinned && "cursor-pointer hover:bg-accent/50", selected === b.name && "bg-primary/5")}
                >
                  {(() => {
                    const t = b.mm_branch_type ? BRANCH_TYPES[b.mm_branch_type] : undefined;
                    const Icon = t?.icon ?? (pinned ? MapPin : MapPinOff);
                    return (
                      <span title={b.mm_branch_type || undefined}
                        className={cn("relative mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", t ? t.soft : pinned ? "bg-teal-500/10 text-teal-600 dark:text-teal-400" : "bg-muted text-muted-foreground")}>
                        <Icon className="h-5 w-5" />
                        {t && !pinned && <MapPinOff className="absolute -bottom-1 -right-1 h-3.5 w-3.5 rounded-full bg-card p-0.5 text-amber-500" />}
                      </span>
                    );
                  })()}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold">{b.branch || b.name}</p>
                      {b.mm_branch_type && <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold", BRANCH_TYPES[b.mm_branch_type]?.soft)}>{b.mm_branch_type}</span>}
                      {!pinned && <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">no location</span>}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">{[b.branch_address, b.city].filter(Boolean).join(", ") || "No address"}</p>
                    <Link
                      to={`/hr/employees?branch=${encodeURIComponent(b.name)}`}
                      onClick={(e) => e.stopPropagation()}
                      className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                    >
                      <Users2 className="h-3 w-3" /> {n} active employee{n === 1 ? "" : "s"}
                    </Link>
                  </div>
                  <div className="flex shrink-0 items-start gap-1 opacity-60 transition-opacity group-hover:opacity-100">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDialog({ open: true, editing: b });
                      }}
                      className="rounded-md p-1.5 hover:bg-accent"
                      title="Edit"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setToDelete(b);
                      }}
                      className="rounded-md p-1.5 text-destructive hover:bg-destructive/10"
                      title="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              );
            })}
            {!isLoading && !rows.length && (
              <li className="p-8 text-center text-sm text-muted-foreground">{branches.length ? "No branch matches your search." : "No branches yet — add your first one."}</li>
            )}
          </ul>
        </Card>
      </div>

      <BranchDialog open={dialog.open} editing={dialog.editing} onClose={() => setDialog({ open: false, editing: null })} onSaved={() => void mutate()} />
      <ConfirmDialog
        open={!!toDelete}
        title={`Delete ${toDelete?.name ?? "branch"}?`}
        description="Employees linked to this branch will block the delete."
        confirmLabel="Delete"
        destructive
        loading={deleting}
        onConfirm={() => void remove()}
        onClose={() => setToDelete(null)}
      />
    </div>
  );
}
