/** Shapes returned by realestate.analytics (dashboard "analytics" and insights "extra"). */
import type { Highlight } from "@/sc/components/analytics/kit";

export interface TrendPoint {
  month: string; installments: number; society: number; surcharge: number; collected: number; bookings: number; booked: number;
  due: number; due_paid: number; efficiency: number; cumulative_booked?: number; avg_ticket?: number;
}
export interface NameValue { name: string; value: number; amount?: number; sold?: number }
export interface Receivables {
  total: number; overdue: number; current: number; overdue_pct: number; aging: NameValue[]; society: number; surcharge: number;
}
export interface BlockScore {
  block: string; color: string | null; block_type: string; plots: number; sold: number; available: number; unsold_value: number;
  booked: number; received: number; overdue: number; avg_ticket: number; sold_pct: number; recovery_pct: number; overdue_pct: number; society_due: number;
}
export interface SizeMix { name: string; plots: number; sold: number; avg_price: number; unsold_value: number; sold_pct: number }
export interface Mix { status: NameValue[]; types: NameValue[]; sizes: SizeMix[]; bookings: NameValue[] }
export interface ForecastPoint { month: string; expected: number; installments: number }
export interface Receipt { name: string; customer: string; customer_name: string; plot: string; amount: number; mode_of_payment: string; payment_against: string; posting_date: string }
export interface AgentScore {
  agent: string; name: string; bookings: number; booked: number; collected: number; overdue: number; avg_ticket: number; bookings_month: number;
  leads: number; deals: number; won: number; visits: number; calls: number; messages: number; collected_month: number;
  conversion: number; recovery_pct: number; overdue_pct: number; score: number;
}
export interface SourceRow { source: string; leads: number; deals: number; bookings: number; conversion: number }

export interface DashboardAnalytics {
  trend: TrendPoint[]; receivables: Receivables; blocks: BlockScore[]; mix: Mix; forecast: ForecastPoint[]; recent: Receipt[];
  efficiency: { due: number; paid: number; pct: number }; mtd: { now: number; prev: number; days: number }; highlights: Highlight[];
}
export interface InsightsExtra {
  trend: TrendPoint[]; receivables: Receivables; blocks: BlockScore[]; mix: Mix; agents: AgentScore[]; sources: SourceRow[];
  forecast: ForecastPoint[]; compare: Record<"collected" | "booked" | "bookings" | "society", { now: number; before: number }>; highlights: Highlight[];
}
