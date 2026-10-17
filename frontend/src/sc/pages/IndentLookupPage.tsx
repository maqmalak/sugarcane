/**
 * Indent lookup (/indenting/lookup): type or scan an indent number (a USB barcode scanner types it and presses Enter)
 * and see whether it is valid today, for whom, and where the load goes. Gate staff use this until the Phase 3 token
 * screen scans indents itself. Data: sugarcane.cane_indenting.api.lookup.
 */
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, ScanBarcode, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ValidityCard } from "@/sc/components/IndentPanels";
import { Button } from "@/sc/components/ui/button";
import { Input } from "@/sc/components/ui/input";
import { get } from "@/sc/lib/api";

export function IndentLookupPage() {
  const [params, setParams] = useSearchParams();
  const no = params.get("no") ?? "";
  const [text, setText] = useState(no);
  const box = useRef<HTMLInputElement>(null);
  useEffect(() => box.current?.focus(), [no]);
  const { data, isFetching } = useQuery({
    queryKey: ["sc-indent-lookup", no],
    queryFn: () => get<Parameters<typeof ValidityCard>[0]["l"]>("sugarcane.cane_indenting.api.lookup", { indent_no: no }),
    enabled: !!no,
  });
  const go = () => { const v = text.trim().toUpperCase(); if (v) { setParams({ no: v }); setText(""); } };

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6">
      <div>
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-violet-600"><ScanBarcode className="size-4" />Indenting</div>
        <h1 className="text-2xl font-bold tracking-tight">Look up an indent</h1>
        <p className="text-sm text-muted-foreground">Scan the barcode on the slip, or type the indent number and press Enter</p>
      </div>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); go(); }}>
        <div className="relative flex-1">
          <ScanBarcode className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
          <Input ref={box} value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. 26-001-100001" className="h-12 pl-10 font-mono text-lg" />
        </div>
        <Button type="submit" className="h-12 px-5"><Search />Find</Button>
      </form>
      {isFetching && <div className="h-48 animate-pulse rounded-2xl border bg-muted/40" />}
      {!isFetching && data && !data.found && (
        <p className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-700 dark:text-red-300">No indent <b className="font-mono">{data.indent_no}</b> — check the number on the slip.</p>
      )}
      {!isFetching && data?.found && (
        <ValidityCard l={data} actions={
          <Link to={`/indenting/d/cane-indent/${encodeURIComponent(data.indent!.name)}`} className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm hover:bg-accent">
            <ExternalLink className="size-4" />Open indent</Link>} />
      )}
    </div>
  );
}
