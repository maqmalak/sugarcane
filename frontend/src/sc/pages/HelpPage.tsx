/**
 * Help (/help?m=<manual>): the user manuals for the signed-in person's roles (sugarcane/manuals/*.md, rendered on the
 * server). Managers see every manual. Data: sugarcane.api.v1.help.
 */
import { useQuery } from "@tanstack/react-query";
import { BookOpen, Printer } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { Badge } from "@/sc/components/ui/badge";
import { Button } from "@/sc/components/ui/button";
import { Skeleton } from "@/sc/components/ui/skeleton";
import { get } from "@/sc/lib/api";
import { cn } from "@/sc/lib/utils";

const API = "sugarcane.api.v1.help";
interface Entry { slug: string; title: string; roles: string[]; mine: boolean }
interface Manual { slug: string; title: string; roles: string[]; html: string }

export function HelpPage() {
  const [params, setParams] = useSearchParams();
  const list = useQuery({ queryKey: ["help"], queryFn: () => get<Entry[]>(`${API}.manuals`) });
  const first = list.data?.find((m) => m.mine && m.slug !== "getting-started")?.slug ?? list.data?.[0]?.slug;
  const slug = params.get("m") || first || "";
  const doc = useQuery({ queryKey: ["help", slug], queryFn: () => get<Manual>(`${API}.manual`, { slug }), enabled: !!slug });
  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-teal-600"><BookOpen className="size-4" />Help</div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">User manuals</h1>
        <p className="text-sm text-muted-foreground">What each role does in the ERP, step by step. Yours are marked.</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <nav className="h-fit rounded-2xl border bg-card p-2 shadow-sm">
          {!list.data && <Skeleton className="h-64" />}
          {list.data?.map((m) => (
            <button key={m.slug} onClick={() => setParams({ m: m.slug }, { replace: true })}
              className={cn("flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-accent", m.slug === slug && "bg-accent font-semibold")}>
              <span>{m.title}</span>{m.mine && <Badge tone="green">yours</Badge>}
            </button>
          ))}
        </nav>
        <article className="rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
          {!doc.data ? <Skeleton className="h-96" /> : (
            <>
              <div className="mb-4 flex flex-wrap items-center gap-2 print:hidden">
                {doc.data.roles.filter((r) => r !== "all").map((r) => <Badge key={r}>{r}</Badge>)}
                <span className="flex-1" />
                <Button size="sm" variant="outline" onClick={() => window.print()}><Printer className="size-4" />Print</Button>
              </div>
              <div className="manual max-w-3xl space-y-3 text-[15px] leading-7 [&_h1]:mb-2 [&_h1]:text-2xl [&_h1]:font-bold [&_h2]:mt-6 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-teal-700 dark:[&_h2]:text-teal-400 [&_li]:ml-5 [&_ol]:list-decimal [&_ol]:space-y-1 [&_ul]:list-disc [&_ul]:space-y-1 [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_strong]:font-semibold"
                dangerouslySetInnerHTML={{ __html: doc.data.html }} />
            </>
          )}
        </article>
      </div>
    </div>
  );
}
