import { asNumber } from "./cn";

/**
 * Currency formatting utilities. Kept dependency-free so they work off-line and
 * are deterministic. Amounts follow ERPNext conventions (2 decimals by default).
 */

const DEFAULT_CURRENCY = "USD";

/**
 * The company/tenant's active currency, kept in sync with the selected
 * company by `CompanyProvider` (see `useCompanyContext`). Any call site that
 * doesn't pass an explicit currency (a list column with no per-row currency
 * field, a KPI tile, etc.) falls back to this instead of a hardcoded code —
 * so switching the active company updates every such amount automatically.
 */
let activeCurrency = DEFAULT_CURRENCY;

/** Set the app-wide fallback currency. Pass `undefined`/empty to leave it unchanged. */
export function setActiveCurrency(currency?: string | null): void {
  if (currency) activeCurrency = currency;
}

export function getActiveCurrency(): string {
  return activeCurrency;
}

/** Compact number -> "12.5M", "365.2K". */
export function compactNumber(value: number): string {
  if (Number.isNaN(value)) return "0";
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toFixed(0);
}

export const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$",
  EUR: "€",
  GBP: "£",
  PKR: "₨",
  INR: "₹",
  AED: "د.إ",
  SAR: "﷼",
  CAD: "C$",
  CNY: "¥",
  JPY: "¥",
};

export function currencySymbol(currency = activeCurrency): string {
  return CURRENCY_SYMBOLS[currency?.toUpperCase()] ?? `${currency} `;
}

export interface MoneyFormatOptions {
  decimals?: number;
  compact?: boolean;
  symbol?: string;
}

/** Format a number as money for a given currency code (defaults to the active company's currency). */
export function formatMoney(
  value: number | null | undefined,
  currency = activeCurrency,
  options: MoneyFormatOptions = {},
): string {
  const symbol = options.symbol ?? currencySymbol(currency);
  const decimals =
    options.decimals ?? (options.compact ? 1 : 2);
  // Anything that rounds to zero is shown as plain zero — never "-0" (negative zero / tiny negatives).
  const raw = asNumber(value);
  const n = Math.abs(raw) < 0.5 * 10 ** -decimals ? 0 : raw;

  const formatted = options.compact
    ? compactNumber(n)
    : n.toLocaleString("en-US", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });

  return `${symbol}${formatted}`;
}

/** Plain number formatting (no symbol). */
export function formatNumber(value: number | null | undefined, decimals = 2): string {
  return asNumber(value).toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}