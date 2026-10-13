import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useFrappeGetCall, useFrappeGetDocList } from "frappe-react-sdk";
import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { Camera, ChevronLeft, ChevronRight, ExternalLink, LayoutGrid, List, MapPin, Search } from "lucide-react";
import { GrowerAvatar } from "@/sc/components/PhotoGallery";
import { cn } from "@/sc/lib/utils";
import { fmtInt } from "@/sc/lib/fmt";
import { Card, CardContent } from "@/sc/components/ui/card";
import { Input, Select } from "@/sc/components/ui/input";
import { Button } from "@/sc/components/ui/button";
import { Badge } from "@/sc/components/ui/badge";
import { Skeleton } from "@/sc/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/sc/components/ui/table";

interface GrowerRow {
  name: string;
  grower_name: string;
  father_name?: string;
  cnic: string;
  mobile?: string;
  passbook_no?: string;
  circle: string;
  village: string;
  village_name?: string;
  filer_status: string;
  bank_name?: string;
  iban?: string;
  grower_photo?: string | null;
}

const PAGE = 24;
const growerUrl = (name: string) => `/setup/d/grower/${encodeURIComponent(name)}`;
const col = createColumnHelper<GrowerRow>();

export function GrowersPage() {
  const [params, setParams] = useSearchParams();
  const [text, setText] = useState(params.get("q") ?? "");
  const q = params.get("q") ?? "";
  const circle = params.get("circle") ?? "";
  const start = Number(params.get("start") ?? 0);
  const withPhoto = params.get("photo") === "1";
  // cards (big photos) or the table; remembered on this browser
  const [view, setView] = useState<"cards" | "table">(() => { try { return (localStorage.getItem("sc-growers-view") as "cards" | "table") || "cards"; } catch { return "cards"; } });
  const pick = (v: "cards" | "table") => { setView(v); try { localStorage.setItem("sc-growers-view", v); } catch { /* private window */ } };

  useEffect(() => {
    const t = setTimeout(() => {
      if (text !== q) update({ q: text || null, start: null });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const update = (next: Record<string, string | null>) => {
    const p = new URLSearchParams(params);
    Object.entries(next).forEach(([k, v]) => (v === null || v === "" ? p.delete(k) : p.set(k, v)));
    setParams(p, { replace: true });
  };

  const { data: circles } = useFrappeGetDocList<{ name: string; circle_code: string }>("Cane Circle", {
    fields: ["name", "circle_code"], orderBy: { field: "circle_code", order: "asc" }, limit: 500,
  });
  const { data, isLoading } = useFrappeGetCall<{ message: { rows: GrowerRow[]; total: number } }>(
    "sugarcane.api.v1.growers.search", { q, circle, start, page_length: PAGE, with_photo: withPhoto ? 1 : 0 },
  );
  const rows = data?.message.rows ?? [];
  const total = data?.message.total ?? 0;

  const columns = useMemo(() => [
    col.accessor("name", { header: "Grower ID", cell: (c) => <span className="whitespace-nowrap font-mono text-xs">{c.getValue()}</span> }),
    col.accessor("grower_name", {
      header: "Grower",
      cell: (c) => (
        <div className="flex items-center gap-2.5">
          <GrowerAvatar name={c.getValue()} photo={c.row.original.grower_photo} className="size-10" />
          <div>
            <Link to={growerUrl(c.row.original.name)} className="font-medium hover:text-primary hover:underline">{c.getValue()}</Link>
            {c.row.original.father_name && <div className="text-xs text-muted-foreground">s/o {c.row.original.father_name}</div>}
          </div>
        </div>
      ),
    }),
    col.accessor("cnic", { header: "CNIC", cell: (c) => <span className="whitespace-nowrap font-mono text-xs">{c.getValue()}</span> }),
    col.accessor("passbook_no", { header: "Passbook", cell: (c) => <span className="whitespace-nowrap">{c.getValue() ?? "—"}</span> }),
    col.accessor("village_name", {
      header: "Village / Circle",
      cell: (c) => (
        <div>
          <div>{c.getValue()}</div>
          <div className="text-xs text-muted-foreground">{c.row.original.circle}</div>
        </div>
      ),
    }),
    col.accessor("bank_name", {
      header: "Bank",
      cell: (c) => (c.getValue() ? c.getValue() : <Badge tone="amber">No bank</Badge>),
    }),
    col.accessor("filer_status", {
      header: "Tax",
      cell: (c) => <Badge tone={c.getValue() === "Filer" ? "green" : "gray"}>{c.getValue()}</Badge>,
    }),
    col.display({
      id: "open",
      header: "",
      cell: (c) => (
        <Link className="text-muted-foreground hover:text-foreground" to={growerUrl(c.row.original.name)} title="Open grower (photos, land, surveys)">
          <ExternalLink className="h-4 w-4" />
        </Link>
      ),
    }),
  ], []);

  const table = useReactTable({ data: rows, columns, getCoreRowModel: getCoreRowModel() });

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h1 className="text-xl font-semibold">Growers</h1>
          <p className="text-sm text-muted-foreground">{fmtInt(total)} active growers{circle ? ` in ${circle}` : ""}</p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-2.5 top-3 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Name, CNIC, ID, passbook, village" value={text}
            onChange={(e) => setText(e.target.value)} />
        </div>
        <Select
          className="w-auto"
          value={circle}
          onChange={(e) => update({ circle: e.target.value || null, start: null })}
          aria-label="Circle"
        >
          <option value="">All circles</option>
          {(circles ?? []).map((c) => (
            <option key={c.name} value={c.name}>{c.circle_code} · {c.name}</option>
          ))}
        </Select>
        <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border bg-card px-3 text-sm">
          <input type="checkbox" checked={withPhoto} onChange={(e) => update({ photo: e.target.checked ? "1" : null, start: null })} />
          <Camera className="size-4 text-muted-foreground" />With photo
        </label>
        <div className="inline-flex rounded-lg border bg-muted/50 p-0.5" role="radiogroup" aria-label="View">
          {([["cards", LayoutGrid, "Cards"], ["table", List, "Table"]] as const).map(([v, Icon, label]) => (
            <button key={v} type="button" role="radio" aria-checked={view === v} onClick={() => pick(v)} title={label}
              className={cn("inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium", view === v ? "bg-background shadow" : "text-muted-foreground hover:text-foreground")}>
              <Icon className="size-4" />{label}
            </button>
          ))}
        </div>
      </div>

      {view === "cards" ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {isLoading && !rows.length && Array.from({ length: 12 }).map((_, i) => <Skeleton key={i} className="aspect-[3/4] rounded-2xl" />)}
          {rows.map((g) => (
            <Link key={g.name} to={growerUrl(g.name)}
              className="group overflow-hidden rounded-2xl border bg-card shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg">
              <div className="relative aspect-square bg-muted">
                <CardPhoto url={g.grower_photo} name={g.grower_name} />
                <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 font-mono text-[10px] text-white">{g.name}</span>
                {!g.passbook_no && <span className="absolute right-2 top-2 rounded-full bg-amber-500/90 px-2 py-0.5 text-[10px] font-semibold text-white">CNIC</span>}
              </div>
              <div className="space-y-0.5 p-3">
                <div className="truncate font-semibold group-hover:text-primary" title={g.grower_name}>{g.grower_name}</div>
                {g.father_name && <div className="truncate text-xs text-muted-foreground">s/o {g.father_name}</div>}
                <div className="flex items-center gap-1 truncate text-xs text-muted-foreground"><MapPin className="size-3 shrink-0" />{g.village_name ?? g.village} · {g.circle}</div>
                <div className="font-mono text-[11px] text-muted-foreground">{g.cnic}</div>
              </div>
            </Link>
          ))}
          {!isLoading && !rows.length && <p className="col-span-full py-10 text-center text-muted-foreground">No growers found</p>}
        </div>
      ) : (
      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((hg) => (
                <TableRow key={hg.id}>
                  {hg.headers.map((h) => <TableHead key={h.id}>{flexRender(h.column.columnDef.header, h.getContext())}</TableHead>)}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {isLoading && !rows.length
                ? Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={columns.length}><Skeleton className="h-6 w-full" /></TableCell>
                  </TableRow>
                ))
                : table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                    ))}
                  </TableRow>
                ))}
              {!isLoading && !rows.length && (
                <TableRow>
                  <TableCell colSpan={columns.length} className="py-10 text-center text-muted-foreground">No growers found</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      )}

      <div className="flex items-center justify-end gap-2 text-sm">
        <span className="text-muted-foreground">
          {total ? `${start + 1}–${Math.min(start + PAGE, total)} of ${fmtInt(total)}` : ""}
        </span>
        <Button variant="outline" size="sm" disabled={start === 0}
          onClick={() => update({ start: String(Math.max(0, start - PAGE)) })} aria-label="Previous page">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="sm" disabled={start + PAGE >= total}
          onClick={() => update({ start: String(start + PAGE) })} aria-label="Next page">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

/** The card's big photo; initials when there is none or the file is missing. */
function CardPhoto({ url, name }: { url?: string | null; name: string }) {
  const [broken, setBroken] = useState(false);
  return url && !broken
    ? <img src={url} alt="" loading="lazy" onError={() => setBroken(true)} className="size-full object-cover transition group-hover:scale-[1.03]" />
    : <div className="grid size-full place-items-center bg-gradient-to-br from-emerald-500/20 to-teal-600/20"><GrowerAvatar name={name} className="size-16 text-lg" /></div>;
}
