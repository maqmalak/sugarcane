import { InsightsPanel } from "./insights-panel";

/**
 * Insight header for the financial reports (server: micromax.financial_insights.get_report_insights) — KPI tiles,
 * a monthly chart, a mix bar and ranked lists for the same company and period as the report below it.
 */
export function ReportInsights({ report, company, fromDate, toDate, currency, extra, omitTiles, hideBars, hideChart, collapsible, title }: {
  report: "gl" | "trial_balance" | "balance_sheet" | "cash_flow"; company?: string | null; fromDate?: string; toDate?: string; currency?: string;
  extra?: Record<string, string | undefined>;
  /** Drop what the report page already shows itself (its own KPI cards, composition, voucher-type summary…). */
  omitTiles?: string[] | true; hideBars?: boolean; hideChart?: boolean;
  /** Start as one "Show more" bar. */
  collapsible?: boolean; title?: string;
}) {
  const ready = Boolean(company && toDate);
  const args = { report, company, from_date: fromDate, to_date: toDate, ...(extra ?? {}) };
  return (
    <InsightsPanel
      method="micromax.financial_insights.get_report_insights"
      args={args}
      cacheKey={ready ? `fin-insights:${JSON.stringify(args)}` : null}
      currency={currency || "PKR"}
      loadingNote="Analysing the ledger for this period — the first run can take a few seconds, then it is cached."
      omitTiles={omitTiles}
      hideBars={hideBars}
      hideChart={hideChart}
      collapsible={collapsible}
      title={title}
    />
  );
}
