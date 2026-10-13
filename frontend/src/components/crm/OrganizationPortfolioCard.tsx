import { Link } from "react-router-dom";
import { useFrappeGetDoc, useFrappeGetDocList } from "frappe-react-sdk";
import { ExternalLink, Globe, Handshake, Landmark, MapPin, UserPlus, Users } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/utils/cn";
import { Avatar } from "@/components/ui/avatar";
import { avatarTone } from "@/components/common/avatar-tone";
import { fileURL } from "@/services/frappe";
import { formatMoney } from "@/utils/currency";
import type { CrmOrganization } from "@/types/frappe";

const enc = encodeURIComponent;


/**
 * The organization's portfolio on a Lead/Deal page: its profile (industry, website, size, revenue,
 * territory, address) plus everything else the company has in the CRM — its other leads and its deals,
 * each linking to that record. `currentLead` / `currentDeal` are left out of their own lists.
 */
export function OrganizationPortfolioCard({
  organization,
  currentLead,
  currentDeal,
}: {
  organization?: string;
  currentLead?: string;
  currentDeal?: string;
}) {
  const org = organization?.trim() || undefined;

  // A null key skips the request; without it the SDK would fetch the whole doctype list when `org` is empty.
  const { data: doc, isLoading } = useFrappeGetDoc<CrmOrganization>("CRM Organization", org, org ? undefined : null);
  const { data: leads } = useFrappeGetDocList<{ name: string; lead_name?: string; status?: string; converted?: number }>(
    "CRM Lead",
    {
      fields: ["name", "lead_name", "status", "converted"],
      filters: [["organization", "=", org ?? ""]],
      orderBy: { field: "modified", order: "desc" },
      limit: 50,
    },
    org ? `micromax.crm.org.leads.${org}` : null,
  );
  const { data: deals } = useFrappeGetDocList<{ name: string; status?: string; deal_value?: number; currency?: string }>(
    "CRM Deal",
    {
      fields: ["name", "status", "deal_value", "currency"],
      filters: [["organization", "=", org ?? ""]],
      orderBy: { field: "modified", order: "desc" },
      limit: 50,
    },
    org ? `micromax.crm.org.deals.${org}` : null,
  );

  if (!org) return null;

  const otherLeads = (leads ?? []).filter((l) => l.name !== currentLead);
  const otherDeals = (deals ?? []).filter((d) => d.name !== currentDeal);
  const openDealValue = (deals ?? [])
    .filter((d) => d.status !== "Lost")
    .reduce((sum, d) => sum + Number(d.deal_value ?? 0), 0);
  const displayName = doc?.organization_name || org;
  const website = doc?.website;

  const url = website ? (/^https?:\/\//i.test(website) ? website : `https://${website}`) : null;
  const chip = "inline-flex max-w-full items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground dark:border-white/10";
  const MAX = 6;
  return (
    <Card className="p-4">
      {isLoading ? (
        <div className="h-16 w-full animate-pulse rounded bg-muted" />
      ) : (
        <div className="space-y-3">
          {/* Identity line */}
          <div className="flex items-center gap-3">
            <Avatar name={displayName} src={doc?.organization_logo ? fileURL(doc.organization_logo) : undefined} size="md" className={avatarTone(displayName)} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{displayName}</p>
              <p className="truncate text-xs text-muted-foreground">{[doc?.industry, doc?.territory].filter(Boolean).join(" · ") || "No industry set"}</p>
            </div>
            {openDealValue > 0 && (
              <span className="shrink-0 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                {formatMoney(openDealValue, deals?.find((d) => d.currency)?.currency || undefined, { compact: true })} open
              </span>
            )}
            <Link to={`/crm/organizations?open=${enc(org)}`} className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-primary" title="View / edit organization">
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </div>

          {/* Facts as chips */}
          <div className="flex flex-wrap gap-1.5">
            {url && (
              <a href={url} target="_blank" rel="noreferrer" className={cn(chip, "text-primary hover:underline")}>
                <Globe className="h-3 w-3 shrink-0" /> <span className="truncate">{website!.replace(/^https?:\/\//i, "")}</span>
              </a>
            )}
            {doc?.no_of_employees && <span className={chip}><Users className="h-3 w-3" /> {doc.no_of_employees} staff</span>}
            {doc?.annual_revenue ? <span className={chip}><Landmark className="h-3 w-3" /> {formatMoney(Number(doc.annual_revenue), doc.currency || undefined, { compact: true })} revenue</span> : null}
            {doc?.address && <span className={chip} title={doc.address}><MapPin className="h-3 w-3 shrink-0" /> <span className="max-w-[16rem] truncate">{doc.address}</span></span>}
            {!url && !doc?.no_of_employees && !doc?.annual_revenue && !doc?.address && <span className="text-[11px] text-muted-foreground">No details recorded</span>}
          </div>

          {/* Related leads / deals as compact chips */}
          {(otherLeads.length > 0 || otherDeals.length > 0) && (
            <div className="space-y-1.5 border-t border-border pt-3">
              {otherLeads.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="mr-1 flex items-center gap-1 text-[11px] font-semibold text-muted-foreground"><UserPlus className="h-3 w-3" /> Leads {otherLeads.length}</span>
                  {otherLeads.slice(0, MAX).map((l) => (
                    <Link key={l.name} to={`/crm/leads/${enc(l.name)}`} className={cn(chip, "text-foreground hover:border-primary/40")} title={l.status}>
                      <span className="max-w-[10rem] truncate">{l.lead_name || l.name}</span>
                      <StatusDot status={l.status} />
                    </Link>
                  ))}
                  {otherLeads.length > MAX && <span className="text-[11px] text-muted-foreground">+{otherLeads.length - MAX} more</span>}
                </div>
              )}
              {otherDeals.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="mr-1 flex items-center gap-1 text-[11px] font-semibold text-muted-foreground"><Handshake className="h-3 w-3" /> Deals {otherDeals.length}</span>
                  {otherDeals.slice(0, MAX).map((d) => (
                    <Link key={d.name} to={`/crm/deals/${enc(d.name)}`} className={cn(chip, "text-foreground hover:border-primary/40")} title={d.status}>
                      <span className="max-w-[10rem] truncate">{d.name}</span>
                      {d.deal_value ? <span className="text-muted-foreground">{formatMoney(Number(d.deal_value), d.currency || undefined, { compact: true })}</span> : null}
                      <StatusDot status={d.status} />
                    </Link>
                  ))}
                  {otherDeals.length > MAX && <span className="text-[11px] text-muted-foreground">+{otherDeals.length - MAX} more</span>}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

/** Tiny coloured dot for a lead / deal status (won / lost / open). */
function StatusDot({ status }: { status?: string | null }) {
  const st = (status ?? "").toLowerCase();
  const tone = /won|converted|qualified/.test(st) ? "bg-emerald-500" : /lost|junk|unqualified/.test(st) ? "bg-rose-500" : "bg-sky-500";
  return <i className={cn("h-1.5 w-1.5 shrink-0 rounded-full", tone)} />;
}
