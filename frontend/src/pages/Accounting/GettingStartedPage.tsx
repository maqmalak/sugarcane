import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useFrappeGetDocCount } from "frappe-react-sdk";
import { CheckCircle2, Circle, ListTree, Receipt, ShoppingBag, Wallet, Landmark, Settings2 } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useCompanyContext, companyFilter } from "@/hooks/useCompanyContext";
import { cn } from "@/utils/cn";

const VISITED_KEY = "micromax.accounting.onboarding.visited";

function readVisited(): Set<string> {
  try {
    const raw = localStorage.getItem(VISITED_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function markVisited(id: string) {
  try {
    const set = readVisited();
    set.add(id);
    localStorage.setItem(VISITED_KEY, JSON.stringify([...set]));
  } catch {
    /* best-effort only */
  }
}

interface Step {
  id: string;
  title: string;
  description: string;
  icon: ReactNode;
  actionLabel: string;
  to: string;
  /** Undefined = tracked via localStorage "visited" instead of a real count. */
  countDoctype?: string;
  countFilters?: unknown[][];
}

/**
 * Modeled on ERPNext's own Accounting module onboarding (6 steps, same
 * order/spirit), retargeted at real pages in this app rather than the
 * generic desk UI, with genuine completion state — not a fake checklist.
 */
export function GettingStartedPage() {
  const navigate = useNavigate();
  const { company } = useCompanyContext();
  const [visited, setVisited] = useState<Set<string>>(() => readVisited());

  useEffect(() => {
    document.title = "Getting Started — Accounting";
  }, []);

  const steps: Step[] = [
    {
      id: "chart-of-accounts",
      title: "Review your Chart of Accounts",
      description: "Every company starts with a standard set of accounts — check it matches how you actually track money.",
      icon: <ListTree className="h-5 w-5" />,
      actionLabel: "Open Chart of Accounts",
      to: "/accounting/chart-of-accounts",
      countDoctype: "Account",
      countFilters: companyFilter(company),
    },
    {
      id: "sales-tax",
      title: "Set up a Sales Tax Template",
      description: "Define the taxes and charges applied on your sales invoices and export orders.",
      icon: <Receipt className="h-5 w-5" />,
      actionLabel: "Set Up Sales Tax",
      to: "/accounting/tax-templates/sales",
      countDoctype: "Sales Taxes and Charges Template",
      countFilters: companyFilter(company),
    },
    {
      id: "sales-transaction",
      title: "Create your first sales transaction",
      description: "Record an Export Order — the sales-side transaction that eventually posts to your ledger.",
      icon: <ShoppingBag className="h-5 w-5" />,
      actionLabel: "Go to Export Orders",
      to: "/export/orders",
      countDoctype: "Sales Order",
      countFilters: companyFilter(company),
    },
    {
      id: "payment",
      title: "Record a payment",
      description: "Payments received or made against invoices — see what's already been recorded.",
      icon: <Wallet className="h-5 w-5" />,
      actionLabel: "View Purchase Invoices",
      to: "/purchase/invoices",
      countDoctype: "Payment Entry",
      countFilters: companyFilter(company),
    },
    {
      id: "balance-sheet",
      title: "View your Balance Sheet",
      description: "See assets, liabilities and equity roll up for the current fiscal year, computed live by ERPNext.",
      icon: <Landmark className="h-5 w-5" />,
      actionLabel: "View Balance Sheet",
      to: "/accounting/reports/balance-sheet",
    },
    {
      id: "settings",
      title: "Review Accounts Settings",
      description: "Company-wide accounting policies — rounding, credit limits, stock/GL sync and more.",
      icon: <Settings2 className="h-5 w-5" />,
      actionLabel: "Open Settings",
      to: "/settings",
    },
  ];

  // Fixed, known set of tracked doctypes — called explicitly (not via .map)
  // so the hook count/order never varies across renders.
  const companyFilterRows = companyFilter(company);
  const { data: coaCount } = useFrappeGetDocCount("Account", companyFilterRows as any, false, `micromax.onboarding.count.coa.${company ?? ""}`);
  const { data: taxCount } = useFrappeGetDocCount(
    "Sales Taxes and Charges Template",
    companyFilterRows as any,
    false,
    `micromax.onboarding.count.tax.${company ?? ""}`,
  );
  const { data: salesCount } = useFrappeGetDocCount("Sales Order", companyFilterRows as any, false, `micromax.onboarding.count.sales.${company ?? ""}`);
  const { data: paymentCount } = useFrappeGetDocCount(
    "Payment Entry",
    companyFilterRows as any,
    false,
    `micromax.onboarding.count.payment.${company ?? ""}`,
  );
  const countById = new Map<string, number>([
    ["chart-of-accounts", Number(coaCount) || 0],
    ["sales-tax", Number(taxCount) || 0],
    ["sales-transaction", Number(salesCount) || 0],
    ["payment", Number(paymentCount) || 0],
  ]);

  const isDone = (step: Step) => (step.countDoctype ? (countById.get(step.id) ?? 0) > 0 : visited.has(step.id));
  const doneCount = steps.filter(isDone).length;

  const onAction = (step: Step) => {
    if (!step.countDoctype) {
      markVisited(step.id);
      setVisited(readVisited());
    }
    navigate(step.to);
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Getting Started"
        subtitle={`${doneCount} of ${steps.length} steps done — set up accounting for your business`}
      />

      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all duration-500"
          style={{ width: `${(doneCount / steps.length) * 100}%` }}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {steps.map((step) => {
          const done = isDone(step);
          return (
            <Card key={step.id} className={cn("flex items-start gap-4 p-5", done && "opacity-80")}>
              <span
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
                  done ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-primary/10 text-primary",
                )}
              >
                {step.icon}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold">{step.title}</h3>
                  {done ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                  ) : (
                    <Circle className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                </div>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{step.description}</p>
                <Button size="sm" variant={done ? "outline" : "primary"} className="mt-3" onClick={() => onAction(step)}>
                  {step.actionLabel}
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
