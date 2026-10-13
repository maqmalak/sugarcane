import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useFrappeGetCall, useFrappeGetDocList } from "frappe-react-sdk";
import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { ChevronLeft, ChevronRight, ExternalLink, Search } from "lucide-react";
import { fmtInt } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

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
}

const PAGE = 25;
const col = createColumnHelper<GrowerRow>();

export function GrowersPage() {
  const [params, setParams] = useSearchParams();
  const [text, setText] = useState(params.get("q") ?? "");
  const q = params.get("q") ?? "";
  const circle = params.get("circle") ?? "";
  const start = Number(params.get("start") ?? 0);

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
    "sugarcane.api.v1.growers.search", { q, circle, start, page_length: PAGE },
  );
  const rows = data?.message.rows ?? [];
  const total = data?.message.total ?? 0;

  const columns = useMemo(() => [
    col.accessor("name", { header: "Grower ID", cell: (c) => <span className="whitespace-nowrap font-mono text-xs">{c.getValue()}</span> }),
    col.accessor("grower_name", {
      header: "Grower",
      cell: (c) => (
        <div>
          <div className="font-medium">{c.getValue()}</div>
          {c.row.original.father_name && <div className="text-xs text-muted-foreground">s/o {c.row.original.father_name}</div>}
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
        <a className="text-muted-foreground hover:text-foreground" href={`/app/grower/${encodeURIComponent(c.row.original.name)}`}
          title="Open in Desk">
          <ExternalLink className="h-4 w-4" />
        </a>
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
      </div>

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
