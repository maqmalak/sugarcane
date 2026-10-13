import type { Geometry } from "geojson";

export type PlotStatus = "Available" | "Reserved" | "Booked" | "Sold" | "Blocked" | "Hold" | "Possession Given";
export type PaymentStatus = "" | "Paid" | "Due" | "Overdue";

export interface Boot {
  user: string | null;
  full_name?: string;
  user_image?: string | null;
  roles?: string[];
  is_staff?: boolean;
  csrf_token?: string;
  default_project?: string | null;
  mock_mode?: boolean;
  company?: string | null;
  currency?: string;
  maund_kg?: number;
  season?: { name: string; status: string; start_date: string; end_date: string; govt_rate: number; crushing_target_maund: number } | null;
  language?: string;
}

export interface MapPlot {
  name: string;
  block: string;
  plot_size: string;
  status: PlotStatus;
  payment_status: PaymentStatus | null;
  customer_name: string | null;
  list_price: number;
  geojson: Geometry | null;
  street: string | null;
  is_corner: 0 | 1;
  is_park_facing: 0 | 1;
  is_boulevard_facing: 0 | 1;
  booking: string | null;
  overdue_amount?: number;
  outstanding_amount?: number;
  next_due_date?: string | null;
}

export interface MapBlock {
  name: string;
  block_code: string;
  block_type: string;
  color: string;
  geojson: Geometry | null;
  planned_plots: number;
  area_kanal: number;
}

export interface MapFeature {
  name: string;
  feature_name: string;
  feature_type: string;
  category: string;
  color: string | null;
  geojson: Geometry | null;
  width_ft: number | null;
}

export interface MapData {
  project: {
    name: string;
    centre_lat: number;
    centre_lng: number;
    default_zoom: number;
    boundary_geojson: Geometry | null;
    total_area_kanal: number;
    boundary_area_kanal: number;
  };
  blocks: MapBlock[];
  plots: MapPlot[];
  features: MapFeature[];
}

export interface MapTask {
  name: string;
  subject: string;
  type: string | null;
  status: string;
  priority: string;
  lat: number;
  lng: number;
  re_plot: string | null;
  exp_end_date: string | null;
  assigned: string[];
}

export interface Kpis {
  collected_month: number;
  collected_prev_month: number;
  plots_sold: number;
  plots_total: number;
  overdue_installments: number;
  overdue_bookings: number;
  society_overdue: number;
  visits_today: number;
  follow_ups_today: number;
  unread_chats: number;
}

export interface CollectionPoint {
  label: string;
  collected: number;
  pending: number;
  overdue: number;
}

export interface VisitStage {
  stage: string;
  count: number;
  rate: number;
}

export interface ScheduleVisit {
  name: string;
  party_type: string;
  party: string;
  party_name: string;
  mobile_no: string | null;
  visit_on: string;
  interested_plot: string | null;
  agent: string | null;
}

export interface FollowUp {
  name: number;
  title: string;
  due_date: string;
  reference_doctype: string | null;
  reference_docname: string | null;
  assigned_to: string | null;
  priority: string;
  mobile_no: string | null;
}

export interface UrgentTask {
  name: string;
  subject: string;
  priority: string;
  status: string;
  re_plot: string | null;
  re_block: string | null;
  type: string | null;
  exp_end_date: string | null;
  creation: string;
  re_priority?: string | null;
}

export interface Dashboard {
  kpis: Kpis;
  collection: CollectionPoint[];
  visits: VisitStage[];
  schedule: { visits: ScheduleVisit[]; follow_ups: FollowUp[] };
  urgent: UrgentTask[];
  analytics: import("./analytics-types").DashboardAnalytics;
  expiring?: { name: string; title: string; document_type: string; authority: string | null; expiry_date: string; status: string; responsible: string | null }[];
  scope?: { agent: boolean; user: string | null; name: string | null };
  approvals?: { count: number; rows: { doctype: string; name: string; state: string; who: string | null; modified: string; can_act: boolean }[] };
}

export interface Installment {
  label: string;
  due_date: string;
  amount: number;
  paid_amount: number;
  status: string;
}

export interface PlotDetail {
  plot: {
    name: string;
    block: string;
    plot_size: string;
    plot_type: string;
    area_marla: number;
    status: PlotStatus;
    payment_status: PaymentStatus | null;
    list_price: number;
    street: string | null;
    is_corner: 0 | 1;
    is_park_facing: 0 | 1;
    is_boulevard_facing: 0 | 1;
    customer: string | null;
    booking: string | null;
    geojson: string | null;
    centre_lat: number | null;
    centre_lng: number | null;
    project: string;
    hold_reason?: string | null;
    price_history?: { changed_on: string; old_price: number; new_price: number; change_percent: number; reason: string | null }[];
    possession_date?: string | null;
  };
  booking: {
    name: string;
    booking_date: string;
    status: string;
    payment_plan: string;
    net_price: number;
    total_price: number;
    discount: number;
    paid_amount: number;
    outstanding_amount: number;
    overdue_amount: number;
    next_due_date: string | null;
    next_due_amount: number;
    possession_date?: string | null;
    possession_given_by?: string | null;
    customer_cnic?: string | null;
    nominee_name?: string | null;
  } | null;
  installments: Installment[];
  photos?: { name: string; file_name: string; file_url: string; creation: string }[];
  site_plan_svg?: string;
  bills: { name: string; bill_month_label: string; total_amount: number; outstanding_amount: number; status: string; due_date: string }[];
  payments: { name: string; posting_date: string; amount: number; mode_of_payment: string; payment_against: string }[];
  files: { name: string; file_name: string; file_url: string; creation: string }[];
  tasks: { name: string; subject: string; status: string; priority: string; creation: string }[];
  owner: { name: string; customer_name: string; mobile_no: string | null; email_id: string | null } | null;
  agent: { user: string; name: string; mobile_no: string | null } | null;
  nearby: { type: string; name: string; metres: number }[];
}

export interface TimelineItem {
  kind: string;
  at: string;
  title: string;
  body: string;
  doctype: string | null;
  name: string | null;
  status: string | null;
  direction: string | null;
}

export interface Version {
  name: string;
  owner: string;
  creation: string;
  data: string;
}

export interface Communication {
  name: string;
  subject: string;
  sender: string;
  recipients: string;
  communication_date: string;
  sent_or_received: string;
  content: string;
}

export interface FileRow {
  name: string;
  file_name: string;
  file_url: string;
  creation: string;
  is_private: 0 | 1;
}

export interface ToDoRow {
  name: string;
  allocated_to: string;
  status: string;
  date: string | null;
  description: string;
  priority: string;
}
