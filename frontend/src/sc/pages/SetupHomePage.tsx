/** Sugar setup (/setup): every master and setting, grouped, with record counts and a quick health check. */
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Boxes, MapPinned } from "lucide-react";
import { Link } from "react-router-dom";
import { Skeleton } from "@/sc/components/ui/skeleton";
import { get } from "@/sc/lib/api";
import { num } from "@/sc/lib/format";
import { docBase, docsOf } from "@/sc/registry";

export function SetupHomePage() {
  const docs = docsOf("setup");
  const { data: counts, isLoading } = useQuery({
    queryKey: ["sc-setup-counts"],
    queryFn: async () => {
      const out: Record<string, number | null> = {};
      await Promise.all(docs.filter((d) => d.doctype !== "Sugar Settings").map(async (d) => {
        try {
          out[d.doctype] = await get<number>("frappe.client.get_count", { doctype: d.doctype });
        } catch {
          out[d.doctype] = null;
        }
      }));
      return out;
    },
  });
  const groups = [...new Set(docs.map((d) => d.group))];

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-500/25"><Boxes className="size-5" /></span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Sugar setup</h1>
            <p className="text-sm text-muted-foreground">Settings, seasons and every master the mill runs on</p>
          </div>
        </div>
        <Link to="/survey/geo" className="inline-flex h-9 items-center gap-2 rounded-lg border-[1.5px] border-input bg-input-bg px-3 text-sm font-semibold hover:bg-accent">
          <MapPinned className="size-4" />Pins & boundaries (Area Map)
        </Link>
      </div>
      {groups.map((g) => (
        <section key={g}>
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">{g}</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {docs.filter((d) => d.group === g).map((d) => (
              <Link key={d.doctype} to={docBase(d.doctype)}
                className="group flex items-center gap-3 rounded-2xl border bg-card p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><d.icon className="size-5" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold group-hover:text-primary">{d.label}</span>
                  <span className="text-xs text-muted-foreground">
                    {d.doctype === "Sugar Settings" ? "Company, season, accounts, field force" : isLoading ? <Skeleton className="mt-1 h-3 w-14" /> :
                      counts?.[d.doctype] === null ? "no access" : `${num(counts?.[d.doctype] ?? 0)} records`}
                  </span>
                </span>
                <ArrowRight className="size-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" />
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
