import toast from "react-hot-toast";
import {
  ArrowRightLeft, Award, BadgeCheck, MapPin, Briefcase, CalendarClock, CalendarHeart, CalendarRange, Clock3, Coins, DoorOpen,
  FileCheck2, Fingerprint, Hourglass, Layers, Settings2, ListChecks, Receipt, Repeat, ShieldCheck, TrendingUp, XCircle, CheckCircle2,
} from "lucide-react";
import type { DocConfig, ExtraContext, FormAction } from "@/components/doc/doc-config";
import {
  sec, colBreak, tab, data, date, datetime, int, float, currency, check, text, link, select, ro, req, when, time,
  nameCol, textCol, dateCol, moneyCol, statusCol, docstatusCol, yesNoCol, numCol,
} from "@/components/doc/doc-helpers";
import { getLinkedValues } from "@/hooks/useDoc";
import { notifyDataChanged } from "@/hooks/useRealtime";
import { humanizeError, postCall } from "@/services/frappe";
import { formatDate, todayISO } from "@/utils/dates";
import { asNumber } from "@/utils/cn";
import { LoanEligibilityPanel } from "./loan-eligibility";
import { CheckinMap, ShiftLocationMap } from "./location-map";

/* ============================================================================ shared helpers */

/** Employee picked → the read-only name / department (and company) the doctype carries. */
async function employeeInfo(emp: string, extra: string[] = []): Promise<Record<string, any>> {
  const e = await getLinkedValues("Employee", emp, ["employee_name", "department", "company", ...extra]);
  return { employee_name: e.employee_name, department: e.department, ...(e.company ? { company: e.company } : {}), ...Object.fromEntries(extra.map((f) => [f, e[f]])) };
}
const employeeCol = nameCol<any>("Employee", (r) => r.employee_name);
const strip = (d?: string) => (d ? d.replace(/ - [A-Z0-9]{2,6}$/, "") : "—");

/** Approve / reject = set `status`, then submit — how HRMS closes a request. */
function decide(doctype: string, status: string, label: string): FormAction {
  return {
    label,
    icon: status === "Rejected" ? XCircle : CheckCircle2,
    show: (c) => !c.isNew && c.docstatus === 0,
    run: async (c: ExtraContext) => {
      try {
        await postCall("frappe.client.set_value", { doctype, name: c.name, fieldname: "status", value: status });
        const full = await postCall<Record<string, unknown>>("frappe.client.get", { doctype, name: c.name });
        await postCall("frappe.client.submit", { doc: full });
        toast.success(`${doctype} ${status.toLowerCase()}`);
        notifyDataChanged();
        c.reload();
      } catch (e) {
        toast.error(humanizeError(e));
      }
    },
  };
}

const COLORS = ["Blue", "Cyan", "Fuchsia", "Green", "Lime", "Orange", "Pink", "Red", "Violet", "Yellow"];
const hhmm = (t?: string) => (t ? String(t).padStart(8, "0").slice(0, 5) : "—");
/** Shift length in hours (crossing midnight when end ≤ start). */
export function shiftHours(start?: string, end?: string) {
  if (!start || !end) return 0;
  const toMin = (t: string) => {
    const [h, m] = String(t).split(":").map(Number);
    return h * 60 + (m || 0);
  };
  let d = toMin(end) - toMin(start);
  if (d <= 0) d += 24 * 60;
  return d / 60;
}

/* ============================================================================ Shifts */

export const SHIFT_TYPE_CONFIG: DocConfig = {
  doctype: "Shift Type",
  base: "/hr/shift-types",
  singular: "Shift Type",
  plural: "Shift Types",
  subtitle: "Shift timings, grace periods for late check-in / early check-out, and auto attendance",
  icon: Clock3,
  companyScoped: false,
  listFields: ["name", "start_time", "end_time", "color", "enable_auto_attendance", "enable_late_entry_marking", "late_entry_grace_period", "enable_early_exit_marking", "early_exit_grace_period", "allow_overtime", "overtime_type", "holiday_list", "modified"],
  columns: [
    nameCol("Shift Type", (r) => `${hhmm(r.start_time)} – ${hhmm(r.end_time)} · ${shiftHours(r.start_time, r.end_time).toFixed(1)} h`),
    { key: "late_entry_grace_period", label: "Late grace", align: "right", render: (r) => (r.enable_late_entry_marking ? `${asNumber(r.late_entry_grace_period)} min` : <span className="text-muted-foreground">off</span>) },
    { key: "early_exit_grace_period", label: "Early-exit grace", align: "right", render: (r) => (r.enable_early_exit_marking ? `${asNumber(r.early_exit_grace_period)} min` : <span className="text-muted-foreground">off</span>) },
    { key: "allow_overtime", label: "Overtime", render: (r) => (r.allow_overtime ? <span className="text-sm">{r.overtime_type || "Allowed"}</span> : <span className="text-muted-foreground">off</span>) },
    yesNoCol("enable_auto_attendance", "Auto Attendance", "On", "Off"),
    textCol("holiday_list", "Holiday List"),
  ],
  searchFields: ["name", "holiday_list"],
  sort: { key: "start_time", dir: "asc" },
  fields: [
    tab("Shift"),
    sec("Timing"),
    when(req(data("__newname", "Shift Name")), (v) => !v.name),
    req(time("start_time", "Start Time")),
    req(time("end_time", "End Time")),
    colBreak(),
    link("holiday_list", "Holiday List", "Holiday List"),
    select("color", "Colour", COLORS),
    sec("Late check-in & early check-out"),
    check("enable_late_entry_marking", "Mark late check-in"),
    when(int("late_entry_grace_period", "Late check-in grace (minutes)"), (v) => Boolean(v.enable_late_entry_marking)),
    colBreak(),
    check("enable_early_exit_marking", "Mark early check-out"),
    when(int("early_exit_grace_period", "Early check-out grace (minutes)"), (v) => Boolean(v.enable_early_exit_marking)),
    tab("Overtime"),
    sec("Overtime"),
    check("allow_overtime", "Allow Overtime"),
    when(link("overtime_type", "Overtime Type", "Overtime Type"), (v) => Boolean(v.allow_overtime)),
    tab("Auto Attendance"),
    sec("Auto attendance from check-ins"),
    check("enable_auto_attendance", "Enable Auto Attendance"),
    when(select("determine_check_in_and_check_out", "Determine Check-in and Check-out", ["Alternating entries as IN and OUT during the same shift", "Strictly based on Log Type in Employee Checkin"]), (v) => Boolean(v.enable_auto_attendance)),
    when(select("working_hours_calculation_based_on", "Working Hours Calculation Based On", ["First Check-in and Last Check-out", "Every Valid Check-in and Check-out"]), (v) => Boolean(v.enable_auto_attendance)),
    when(date("process_attendance_after", "Process Attendance After"), (v) => Boolean(v.enable_auto_attendance)),
    when(check("mark_auto_attendance_on_holidays", "Mark Auto Attendance on Holidays"), (v) => Boolean(v.enable_auto_attendance)),
    colBreak(),
    int("begin_check_in_before_shift_start_time", "Begin check-in before shift start (minutes)"),
    int("allow_check_out_after_shift_end_time", "Allow check-out after shift end (minutes)"),
    float("working_hours_threshold_for_half_day", "Working hours threshold for Half Day"),
    float("working_hours_threshold_for_absent", "Working hours threshold for Absent"),
    sec("Check-in sync"),
    ro(datetime("last_sync_of_checkin", "Last Sync of Check-in")),
    colBreak(),
    check("auto_update_last_sync", "Automatically Update Last Sync of Check-in"),
  ],
  defaults: () => ({
    start_time: "09:00:00", end_time: "17:00:00", color: "Blue",
    enable_late_entry_marking: 1, late_entry_grace_period: 30, enable_early_exit_marking: 1, early_exit_grace_period: 30,
    begin_check_in_before_shift_start_time: 60, allow_check_out_after_shift_end_time: 60,
    determine_check_in_and_check_out: "Alternating entries as IN and OUT during the same shift",
    working_hours_calculation_based_on: "First Check-in and Last Check-out",
  }),
  summary: (v) => [
    { label: "Hours", value: v.start_time && v.end_time ? `${hhmm(v.start_time)} – ${hhmm(v.end_time)}` : "—", tone: "sky" },
    { label: "Length", value: `${shiftHours(v.start_time, v.end_time).toFixed(1)} h`, tone: "indigo" },
    { label: "Late grace", value: v.enable_late_entry_marking ? `${asNumber(v.late_entry_grace_period)} min` : "Off", tone: "amber" },
    { label: "Early-exit grace", value: v.enable_early_exit_marking ? `${asNumber(v.early_exit_grace_period)} min` : "Off", tone: "rose" },
    { label: "Overtime", value: v.allow_overtime ? v.overtime_type || "Allowed" : "Off", tone: "teal" },
  ],
  titleOf: (v) => (v.start_time ? `${hhmm(v.start_time)} – ${hhmm(v.end_time)}` : "New shift"),
  connections: false,
};

export const SHIFT_ASSIGNMENT_CONFIG: DocConfig = {
  doctype: "Shift Assignment",
  base: "/hr/shift-assignments",
  singular: "Shift Assignment",
  plural: "Shift Assignments",
  subtitle: "Which employee works which shift, and from when",
  icon: CalendarClock,
  submittable: true,
  listFields: ["name", "employee", "employee_name", "department", "shift_type", "start_date", "end_date", "status", "docstatus", "modified"],
  columns: [employeeCol, textCol("shift_type", "Shift"), { key: "department", label: "Department", render: (r) => strip(r.department) }, dateCol("start_date", "From"), dateCol("end_date", "To"), statusCol("status", "Status", "Active"), docstatusCol()],
  searchFields: ["name", "employee", "employee_name", "shift_type"],
  statusField: "status",
  statuses: ["Active", "Inactive"],
  dateField: "start_date",
  dateLabel: "Start date",
  sort: { key: "start_date", dir: "desc" },
  filters: [
    { field: "shift_type", label: "Shift", optionsFrom: "Shift Type" },
    { field: "department", label: "Department", optionsFrom: "Department" },
  ],
  fields: [
    sec("Assignment"),
    req(link("employee", "Employee", "Employee")),
    ro(data("employee_name", "Employee Name")),
    ro(link("department", "Department", "Department")),
    req(link("company", "Company", "Company")),
    colBreak(),
    req(link("shift_type", "Shift Type", "Shift Type")),
    req(date("start_date", "Start Date")),
    date("end_date", "End Date"),
    select("status", "Status", ["Active", "Inactive"]),
    ro(link("shift_request", "Shift Request", "Shift Request")),
  ],
  // From the Roster's empty cells: ?employee=…&start_date=…&end_date=…
  defaults: ({ company, params }) => ({ company, start_date: params.get("start_date") ?? todayISO(), end_date: params.get("end_date") ?? undefined,
    status: "Active", employee: params.get("employee") ?? undefined }),
  linkEffects: { employee: (emp) => employeeInfo(emp) },
  titleOf: (v) => [v.employee_name, v.shift_type].filter(Boolean).join(" · "),
};

export const SHIFT_REQUEST_CONFIG: DocConfig = {
  doctype: "Shift Request",
  base: "/hr/shift-requests",
  singular: "Shift Request",
  plural: "Shift Requests",
  subtitle: "Employees asking for a different shift — approving one creates the shift assignment",
  icon: Repeat,
  submittable: true,
  listFields: ["name", "employee", "employee_name", "department", "shift_type", "from_date", "to_date", "status", "approver", "docstatus", "modified"],
  columns: [employeeCol, textCol("shift_type", "Shift"), dateCol("from_date", "From"), dateCol("to_date", "To"), textCol("approver", "Approver"), statusCol("status", "Status", "Draft")],
  searchFields: ["name", "employee", "employee_name", "shift_type"],
  statusField: "status",
  statuses: ["Draft", "Approved", "Rejected"],
  dateField: "from_date",
  dateLabel: "From",
  sort: { key: "from_date", dir: "desc" },
  fields: [
    sec("Request"),
    req(link("employee", "Employee", "Employee")),
    ro(data("employee_name", "Employee Name")),
    ro(link("department", "Department", "Department")),
    req(link("company", "Company", "Company")),
    colBreak(),
    req(link("shift_type", "Shift Type", "Shift Type")),
    req(date("from_date", "From Date")),
    date("to_date", "To Date"),
    req(link("approver", "Approver", "User")),
    ro(select("status", "Status", ["Draft", "Approved", "Rejected"])),
  ],
  defaults: ({ company }) => ({ company, from_date: todayISO(), status: "Draft" }),
  linkEffects: { employee: (emp) => employeeInfo(emp) },
  actions: [decide("Shift Request", "Approved", "Approve"), decide("Shift Request", "Rejected", "Reject")],
  titleOf: (v) => [v.employee_name, v.shift_type].filter(Boolean).join(" → "),
};

/* ============================================================================ Attendance */

export const ATTENDANCE_REQUEST_CONFIG: DocConfig = {
  doctype: "Attendance Request",
  base: "/hr/attendance-requests",
  singular: "Attendance Request",
  plural: "Attendance Requests",
  subtitle: "Work-from-home and on-duty days — submitting marks the attendance",
  icon: FileCheck2,
  submittable: true,
  listFields: ["name", "employee", "employee_name", "department", "from_date", "to_date", "reason", "half_day", "docstatus", "modified"],
  columns: [employeeCol, textCol("reason", "Reason"), dateCol("from_date", "From"), dateCol("to_date", "To"), yesNoCol("half_day", "Half Day"), docstatusCol()],
  searchFields: ["name", "employee", "employee_name"],
  dateField: "from_date",
  dateLabel: "From",
  sort: { key: "from_date", dir: "desc" },
  filters: [{ field: "reason", label: "Reason", options: ["Work From Home", "On Duty"] }],
  fields: [
    sec("Request"),
    req(link("employee", "Employee", "Employee")),
    ro(data("employee_name", "Employee Name")),
    ro(link("department", "Department", "Department")),
    req(link("company", "Company", "Company")),
    colBreak(),
    req(date("from_date", "From Date")),
    req(date("to_date", "To Date")),
    check("half_day", "Half Day"),
    when(date("half_day_date", "Half Day Date"), (v) => Boolean(v.half_day)),
    link("shift", "Shift", "Shift Type"),
    check("include_holidays", "Include Holidays"),
    sec("Reason"),
    req(select("reason", "Reason", ["Work From Home", "On Duty"])),
    text("explanation", "Explanation"),
  ],
  defaults: ({ company }) => ({ company, from_date: todayISO(), to_date: todayISO(), reason: "On Duty" }),
  linkEffects: { employee: (emp) => employeeInfo(emp) },
  titleOf: (v) => [v.employee_name, v.reason].filter(Boolean).join(" · "),
};

export const CHECKIN_CONFIG: DocConfig = {
  doctype: "Employee Checkin",
  base: "/hr/checkins",
  singular: "Employee Checkin",
  plural: "Employee Checkins",
  subtitle: "Every punch from the biometric devices and the mobile app",
  icon: Fingerprint,
  companyScoped: false,
  listFields: ["name", "employee", "employee_name", "log_type", "time", "shift", "device_id", "attendance", "skip_auto_attendance", "latitude", "longitude", "modified"],
  columns: [employeeCol, { key: "time", label: "Time", render: (r) => <span className="font-mono text-xs">{String(r.time ?? "").slice(0, 16)}</span> }, statusCol("log_type", "Type", "—"), textCol("shift", "Shift"), textCol("device_id", "Device"),
    { key: "latitude", label: "Location", render: (r) => (r.latitude ? <a className="font-mono text-[11px] text-primary hover:underline" href={`https://www.google.com/maps?q=${r.latitude},${r.longitude}`} target="_blank" rel="noreferrer">{Number(r.latitude).toFixed(4)}, {Number(r.longitude).toFixed(4)}</a> : <span className="text-muted-foreground">—</span>) },
    textCol("attendance", "Attendance")],
  searchFields: ["name", "employee", "employee_name", "device_id"],
  statusField: "log_type",
  statuses: ["IN", "OUT"],
  dateField: "time",
  dateLabel: "Time",
  sort: { key: "time", dir: "desc" },
  filters: [{ field: "shift", label: "Shift", optionsFrom: "Shift Type" }],
  fields: [
    sec("Check-in"),
    req(link("employee", "Employee", "Employee")),
    ro(data("employee_name", "Employee Name")),
    select("log_type", "Log Type", ["", "IN", "OUT"]),
    colBreak(),
    req(datetime("time", "Time")),
    data("device_id", "Location / Device ID"),
    check("skip_auto_attendance", "Skip Auto Attendance"),
    sec("Shift"),
    ro(link("shift", "Shift", "Shift Type")),
    ro(datetime("shift_start", "Shift Start")),
    ro(datetime("shift_end", "Shift End")),
    colBreak(),
    ro(datetime("shift_actual_start", "Shift Actual Start")),
    ro(datetime("shift_actual_end", "Shift Actual End")),
    ro(link("attendance", "Attendance Marked", "Attendance")),
    sec("Location"),
    float("latitude", "Latitude"),
    float("longitude", "Longitude"),
    colBreak(),
    data("geolocation", "Map Location (GeoJSON)", { description: "Use Actions → Fetch location to fill it from this device." }),
  ],
  actions: [
    {
      label: "Fetch location", icon: MapPin, show: (c) => !c.readOnly,
      run: (c) => new Promise<void>((resolve) => {
        if (!navigator.geolocation) { toast.error("This browser can't share its location"); resolve(); return; }
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const lat = Number(pos.coords.latitude.toFixed(6)), lng = Number(pos.coords.longitude.toFixed(6));
            c.patch({ latitude: lat, longitude: lng, geolocation: JSON.stringify({ type: "FeatureCollection", features: [
              { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [lng, lat] } }] }) });
            toast.success(`Location ${lat}, ${lng} (±${Math.round(pos.coords.accuracy)} m) — save to keep it`);
            resolve();
          },
          (err) => { toast.error(err.code === 1 ? "Location permission denied — allow it in the browser" : "Couldn't get the location"); resolve(); },
          { enableHighAccuracy: true, timeout: 15000 },
        );
      }),
    },
  ],
  defaults: ({ params }) => ({ log_type: "IN", employee: params.get("employee") ?? undefined }),
  linkEffects: { employee: async (emp) => ({ employee_name: (await getLinkedValues("Employee", emp, ["employee_name"])).employee_name }) },
  titleOf: (v) => [v.employee_name, v.log_type, String(v.time ?? "").slice(0, 16)].filter(Boolean).join(" · "),
  connections: false,
  extra: (c) => <CheckinMap values={c.values} />,
};

/* ============================================================================ Leave */

export const LEAVE_POLICY_CONFIG: DocConfig = {
  doctype: "Leave Policy",
  base: "/hr/leave-policies",
  singular: "Leave Policy",
  plural: "Leave Policies",
  subtitle: "Annual leave entitlement per leave type — assigned to employees to allocate leave",
  icon: ShieldCheck,
  submittable: true,
  companyScoped: false,
  listFields: ["name", "title", "docstatus", "modified"],
  columns: [nameCol("Policy", (r) => r.title), docstatusCol(), dateCol("modified", "Updated")],
  searchFields: ["name", "title"],
  fields: [sec("Policy"), req(data("title", "Title"))],
  children: [
    {
      key: "leave_policy_details",
      label: "Leaves per year",
      doctype: "Leave Policy Detail",
      columns: [req(link("leave_type", "Leave Type", "Leave Type")), req(float("annual_allocation", "Annual Allocation"))],
      minRows: 1,
      totals: (rows) => [{ label: "Total days / year", value: rows.reduce((a, r) => a + asNumber(r.annual_allocation), 0).toLocaleString(), align: "right" }],
    },
  ],
  summary: (_v, rows) => [
    { label: "Leave types", value: (rows.leave_policy_details ?? []).length, tone: "sky" },
    { label: "Days / year", value: (rows.leave_policy_details ?? []).reduce((a, r) => a + asNumber(r.annual_allocation), 0).toLocaleString(), tone: "emerald" },
  ],
  titleOf: (v) => v.title || "New leave policy",
};

export const LEAVE_POLICY_ASSIGNMENT_CONFIG: DocConfig = {
  doctype: "Leave Policy Assignment",
  base: "/hr/leave-policy-assignments",
  singular: "Leave Policy Assignment",
  plural: "Leave Policy Assignments",
  subtitle: "Which policy each employee gets — submitting allocates the leave",
  icon: ListChecks,
  submittable: true,
  listFields: ["name", "employee", "employee_name", "leave_policy", "effective_from", "effective_to", "leaves_allocated", "carry_forward", "docstatus", "modified"],
  columns: [employeeCol, textCol("leave_policy", "Policy"), dateCol("effective_from", "From"), dateCol("effective_to", "To"), yesNoCol("leaves_allocated", "Allocated"), docstatusCol()],
  searchFields: ["name", "employee", "employee_name", "leave_policy"],
  dateField: "effective_from",
  dateLabel: "Effective from",
  sort: { key: "effective_from", dir: "desc" },
  filters: [{ field: "leave_policy", label: "Policy", optionsFrom: "Leave Policy" }],
  fields: [
    sec("Assignment"),
    req(link("employee", "Employee", "Employee")),
    ro(data("employee_name", "Employee Name")),
    ro(link("company", "Company", "Company")),
    req(link("leave_policy", "Leave Policy", "Leave Policy")),
    colBreak(),
    select("assignment_based_on", "Assignment Based On", ["", "Leave Period", "Joining Date"]),
    when(link("leave_period", "Leave Period", "Leave Period"), (v) => v.assignment_based_on === "Leave Period"),
    req(date("effective_from", "Effective From")),
    req(date("effective_to", "Effective To")),
    check("carry_forward", "Add unused leaves from previous allocations"),
    ro(check("leaves_allocated", "Leaves Allocated")),
  ],
  linkEffects: {
    employee: (emp) => employeeInfo(emp),
    leave_period: async (lp) => {
      const p = await getLinkedValues("Leave Period", lp, ["from_date", "to_date"]);
      return { effective_from: p.from_date, effective_to: p.to_date };
    },
  },
  titleOf: (v) => [v.employee_name, v.leave_policy].filter(Boolean).join(" · "),
};

export const LEAVE_PERIOD_CONFIG: DocConfig = {
  doctype: "Leave Period",
  base: "/hr/leave-periods",
  singular: "Leave Period",
  plural: "Leave Periods",
  subtitle: "The leave year that policies allocate against",
  icon: CalendarRange,
  listFields: ["name", "from_date", "to_date", "is_active", "company", "modified"],
  columns: [nameCol("Leave Period", (r) => `${formatDate(r.from_date)} – ${formatDate(r.to_date)}`), yesNoCol("is_active", "Active")],
  searchFields: ["name"],
  sort: { key: "from_date", dir: "desc" },
  fields: [sec("Period"), req(date("from_date", "From Date")), req(date("to_date", "To Date")), colBreak(), req(link("company", "Company", "Company")), check("is_active", "Is Active"), link("optional_holiday_list", "Holiday List for Optional Leave", "Holiday List")],
  defaults: ({ company }) => ({ company, from_date: `${new Date().getFullYear()}-01-01`, to_date: `${new Date().getFullYear()}-12-31`, is_active: 1 }),
};

export const COMPENSATORY_LEAVE_CONFIG: DocConfig = {
  doctype: "Compensatory Leave Request",
  base: "/hr/compensatory-leave",
  singular: "Compensatory Leave Request",
  plural: "Compensatory Leave",
  subtitle: "Leave earned by working on holidays — approval adds it to the allocation",
  icon: CalendarHeart,
  submittable: true,
  companyScoped: false,
  listFields: ["name", "employee", "employee_name", "leave_type", "work_from_date", "work_end_date", "half_day", "docstatus", "modified"],
  columns: [employeeCol, textCol("leave_type", "Leave Type"), dateCol("work_from_date", "Worked From"), dateCol("work_end_date", "Worked To"), docstatusCol()],
  searchFields: ["name", "employee", "employee_name"],
  dateField: "work_from_date",
  dateLabel: "Worked from",
  sort: { key: "work_from_date", dir: "desc" },
  fields: [
    sec("Request"),
    req(link("employee", "Employee", "Employee")),
    ro(data("employee_name", "Employee Name")),
    ro(link("department", "Department", "Department")),
    link("leave_type", "Leave Type", "Leave Type", { filters: [["is_compensatory", "=", 1]] } as any),
    colBreak(),
    req(date("work_from_date", "Work From Date")),
    req(date("work_end_date", "Work End Date")),
    check("half_day", "Half Day"),
    when(date("half_day_date", "Half Day Date"), (v) => Boolean(v.half_day)),
    sec("Reason"),
    req(text("reason", "Reason")),
  ],
  linkEffects: {
    employee: async (emp) => {
      const { company: _company, ...rest } = await employeeInfo(emp);
      return rest;
    },
  },
  titleOf: (v) => v.employee_name || "New request",
};

export const LEAVE_ENCASHMENT_CONFIG: DocConfig = {
  doctype: "Leave Encashment",
  base: "/hr/leave-encashment",
  singular: "Leave Encashment",
  plural: "Leave Encashments",
  subtitle: "Unused leave paid out — through payroll (additional salary) or a payment entry",
  icon: Coins,
  submittable: true,
  listFields: ["name", "employee", "employee_name", "leave_type", "encashment_days", "encashment_amount", "currency", "encashment_date", "status", "docstatus", "modified"],
  columns: [employeeCol, textCol("leave_type", "Leave Type"), numCol("encashment_days", "Days", 1), { key: "encashment_amount", label: "Amount", align: "right", render: (r) => `${r.currency ?? ""} ${asNumber(r.encashment_amount).toLocaleString()}` }, dateCol("encashment_date", "Date"), statusCol("status", "Status", "Draft")],
  searchFields: ["name", "employee", "employee_name", "leave_type"],
  statusField: "status",
  statuses: ["Draft", "Unpaid", "Paid", "Cancelled"],
  dateField: "encashment_date",
  dateLabel: "Encashment date",
  sort: { key: "encashment_date", dir: "desc" },
  fields: [
    sec("Encashment"),
    req(link("employee", "Employee", "Employee")),
    ro(data("employee_name", "Employee Name")),
    ro(link("department", "Department", "Department")),
    req(link("company", "Company", "Company")),
    req(link("leave_period", "Leave Period", "Leave Period")),
    req(link("leave_type", "Leave Type", "Leave Type")),
    colBreak(),
    ro(float("leave_balance", "Leave Balance")),
    ro(float("actual_encashable_days", "Actual Encashable Days")),
    float("encashment_days", "Encashment Days"),
    ro(currency("encashment_amount", "Encashment Amount")),
    date("encashment_date", "Encashment Date"),
    ro(link("currency", "Currency", "Currency")),
    sec("Payment"),
    check("pay_via_payment_entry", "Pay via Payment Entry"),
    when(link("payable_account", "Payable Account", "Account"), (v) => Boolean(v.pay_via_payment_entry)),
    when(link("expense_account", "Expense Account", "Account"), (v) => Boolean(v.pay_via_payment_entry)),
    colBreak(),
    link("cost_center", "Cost Center", "Cost Center"),
    ro(link("additional_salary", "Additional Salary", "Additional Salary")),
  ],
  defaults: ({ company }) => ({ company, encashment_date: todayISO() }),
  linkEffects: { employee: (emp) => employeeInfo(emp) },
  omitOnSave: ["status"],
  titleOf: (v) => [v.employee_name, v.leave_type].filter(Boolean).join(" · "),
};

export const HOLIDAY_LIST_ASSIGNMENT_CONFIG: DocConfig = {
  doctype: "Holiday List Assignment",
  base: "/hr/holiday-list-assignments",
  singular: "Holiday List Assignment",
  plural: "Holiday List Assignments",
  subtitle: "Which holiday list applies to an employee or a whole company, from when",
  icon: CalendarRange,
  submittable: true,
  companyScoped: false,
  listFields: ["name", "applicable_for", "assigned_to", "employee_name", "holiday_list", "from_date", "docstatus", "modified"],
  columns: [nameCol("Assignment", (r) => r.employee_name || r.assigned_to), textCol("applicable_for", "For"), textCol("holiday_list", "Holiday List"), dateCol("from_date", "From"), docstatusCol()],
  searchFields: ["name", "assigned_to", "employee_name", "holiday_list"],
  sort: { key: "from_date", dir: "desc" },
  fields: [
    sec("Assignment"),
    select("naming_series", "Series", ["HR-HLA-.YYYY.-"]),
    req(select("applicable_for", "Applicable For", ["Employee", "Company"])),
    when(req(link("assigned_to", "Employee", "Employee")), (v) => v.applicable_for !== "Company"),
    when(req(link("assigned_to", "Company", "Company")), (v) => v.applicable_for === "Company"),
    ro(data("employee_name", "Employee Name")),
    colBreak(),
    req(link("holiday_list", "Holiday List", "Holiday List")),
    req(date("from_date", "From Date")),
    ro(date("holiday_list_start", "Holiday List Start")),
    ro(date("holiday_list_end", "Holiday List End")),
  ],
  defaults: () => ({ naming_series: "HR-HLA-.YYYY.-", applicable_for: "Employee", from_date: todayISO() }),
  titleOf: (v) => [v.employee_name || v.assigned_to, v.holiday_list].filter(Boolean).join(" · "),
};

/* ============================================================================ Employee masters & lifecycle */

export const EMPLOYMENT_TYPE_CONFIG: DocConfig = {
  doctype: "Employment Type",
  base: "/hr/employment-types",
  singular: "Employment Type",
  plural: "Employment Types",
  subtitle: "Permanent, contract, probation, trainee…",
  icon: Briefcase,
  companyScoped: false,
  listFields: ["name", "modified"],
  columns: [nameCol("Employment Type"), dateCol("modified", "Updated")],
  searchFields: ["name"],
  sort: { key: "name", dir: "asc" },
  fields: [sec("Employment Type"), when(req(data("employee_type_name", "Name")), (v) => !v.name)],
  connections: false,
};

export const EMPLOYEE_GRADE_CONFIG: DocConfig = {
  doctype: "Employee Grade",
  base: "/hr/employee-grades",
  singular: "Employee Grade",
  plural: "Employee Grades",
  subtitle: "Grades with their default salary structure and base pay",
  icon: Layers,
  companyScoped: false,
  listFields: ["name", "default_salary_structure", "default_base_pay", "currency", "modified"],
  columns: [nameCol("Grade"), textCol("default_salary_structure", "Default Salary Structure"), moneyCol("default_base_pay", "Default Base Pay")],
  searchFields: ["name", "default_salary_structure"],
  sort: { key: "name", dir: "asc" },
  fields: [
    sec("Grade"),
    when(req(data("__newname", "Grade Name")), (v) => !v.name),
    link("default_salary_structure", "Default Salary Structure", "Salary Structure"),
    colBreak(),
    when(currency("default_base_pay", "Default Base Pay"), (v) => Boolean(v.default_salary_structure)),
    ro(link("currency", "Currency", "Currency")),
  ],
};

const PROPERTY_HISTORY = (key: string, label: string) => ({
  key,
  label,
  description: "Each row changes one field on the employee when submitted (property = field label, e.g. Designation).",
  doctype: "Employee Property History",
  columns: [req(data("property", "Property")), ro(data("current", "Current")), req(data("new", "New")), data("fieldname", "Field Name")],
});

export const EMPLOYEE_PROMOTION_CONFIG: DocConfig = {
  doctype: "Employee Promotion",
  base: "/hr/promotions",
  singular: "Employee Promotion",
  plural: "Promotions",
  subtitle: "Designation, grade and pay changes — applied to the employee on submit",
  icon: TrendingUp,
  submittable: true,
  listFields: ["name", "employee", "employee_name", "department", "promotion_date", "current_ctc", "revised_ctc", "docstatus", "modified"],
  columns: [employeeCol, { key: "department", label: "Department", render: (r) => strip(r.department) }, dateCol("promotion_date", "Date"), moneyCol("current_ctc", "Current CTC"), moneyCol("revised_ctc", "Revised CTC"), docstatusCol()],
  searchFields: ["name", "employee", "employee_name"],
  dateField: "promotion_date",
  dateLabel: "Promotion date",
  sort: { key: "promotion_date", dir: "desc" },
  fields: [
    sec("Promotion"),
    req(link("employee", "Employee", "Employee")),
    ro(data("employee_name", "Employee Name")),
    ro(link("department", "Department", "Department")),
    link("company", "Company", "Company"),
    colBreak(),
    req(date("promotion_date", "Promotion Date")),
    currency("current_ctc", "Current CTC"),
    when(currency("revised_ctc", "Revised CTC"), (v) => Boolean(v.current_ctc)),
    ro(link("salary_currency", "Salary Currency", "Currency")),
  ],
  children: [PROPERTY_HISTORY("promotion_details", "Promotion details")],
  defaults: ({ company, params }) => ({ company, promotion_date: todayISO(), employee: params.get("employee") ?? undefined }),
  linkEffects: {
    employee: async (emp) => {
      const i = await employeeInfo(emp, ["ctc", "salary_currency"]);
      return { ...i, current_ctc: i.ctc, salary_currency: i.salary_currency };
    },
  },
  summary: (v) => {
    const cur = asNumber(v.current_ctc);
    const rev = asNumber(v.revised_ctc);
    return [
      { label: "Current CTC", value: cur ? cur.toLocaleString() : "—", tone: "sky" },
      { label: "Revised CTC", value: rev ? rev.toLocaleString() : "—", tone: "emerald" },
      { label: "Increase", value: cur && rev ? `${(((rev - cur) / cur) * 100).toFixed(1)}%` : "—", tone: "amber" },
    ];
  },
  titleOf: (v) => v.employee_name || "New promotion",
};

export const EMPLOYEE_TRANSFER_CONFIG: DocConfig = {
  doctype: "Employee Transfer",
  base: "/hr/transfers",
  singular: "Employee Transfer",
  plural: "Transfers",
  subtitle: "Moves between departments, branches or companies",
  icon: ArrowRightLeft,
  submittable: true,
  listFields: ["name", "employee", "employee_name", "department", "transfer_date", "company", "new_company", "docstatus", "modified"],
  columns: [employeeCol, { key: "department", label: "Department", render: (r) => strip(r.department) }, dateCol("transfer_date", "Date"), textCol("new_company", "New Company"), docstatusCol()],
  searchFields: ["name", "employee", "employee_name"],
  dateField: "transfer_date",
  dateLabel: "Transfer date",
  sort: { key: "transfer_date", dir: "desc" },
  fields: [
    sec("Transfer"),
    req(link("employee", "Employee", "Employee")),
    ro(data("employee_name", "Employee Name")),
    ro(link("department", "Department", "Department")),
    link("company", "Company", "Company"),
    colBreak(),
    req(date("transfer_date", "Transfer Date")),
    link("new_company", "New Company", "Company"),
    check("reallocate_leaves", "Re-allocate Leaves"),
    check("create_new_employee_id", "Create New Employee Id"),
    ro(link("new_employee_id", "New Employee ID", "Employee")),
  ],
  children: [{ ...PROPERTY_HISTORY("transfer_details", "Transfer details"), minRows: 1 }],
  defaults: ({ company, params }) => ({ company, transfer_date: todayISO(), employee: params.get("employee") ?? undefined }),
  linkEffects: { employee: (emp) => employeeInfo(emp) },
  titleOf: (v) => v.employee_name || "New transfer",
};

export const EMPLOYEE_SEPARATION_CONFIG: DocConfig = {
  doctype: "Employee Separation",
  base: "/hr/separations",
  singular: "Employee Separation",
  plural: "Separations",
  subtitle: "Exit checklist — clearance tasks, exit interview and boarding status",
  icon: DoorOpen,
  submittable: true,
  listFields: ["name", "employee", "employee_name", "department", "designation", "boarding_begins_on", "resignation_letter_date", "boarding_status", "docstatus", "modified"],
  columns: [employeeCol, { key: "department", label: "Department", render: (r) => strip(r.department) }, textCol("designation", "Designation"), dateCol("boarding_begins_on", "Separation Begins"), statusCol("boarding_status", "Status", "Pending")],
  searchFields: ["name", "employee", "employee_name"],
  statusField: "boarding_status",
  statuses: ["Pending", "In Process", "Completed"],
  dateField: "boarding_begins_on",
  dateLabel: "Begins on",
  sort: { key: "boarding_begins_on", dir: "desc" },
  fields: [
    sec("Separation"),
    req(link("employee", "Employee", "Employee")),
    ro(data("employee_name", "Employee Name")),
    ro(link("department", "Department", "Department")),
    ro(link("designation", "Designation", "Designation")),
    req(link("company", "Company", "Company")),
    colBreak(),
    req(date("boarding_begins_on", "Separation Begins On")),
    ro(date("resignation_letter_date", "Resignation Letter Date")),
    link("employee_separation_template", "Separation Template", "Employee Separation Template"),
    check("notify_users_by_email", "Notify users by email"),
    ro(select("boarding_status", "Status", ["Pending", "In Process", "Completed"])),
    sec("Exit interview"),
    text("exit_interview", "Exit Interview Summary"),
  ],
  children: [
    {
      key: "activities",
      label: "Clearance activities",
      description: "Each activity becomes a task for its user or role.",
      doctype: "Employee Boarding Activity",
      columns: [req(data("activity_name", "Activity")), link("user", "User", "User"), link("role", "Role", "Role"), int("begin_on", "Begin On (days)"), int("duration", "Duration (days)"), ro(link("task", "Task", "Task"))],
      wide: true,
    },
  ],
  defaults: ({ company, params }) => ({ company, boarding_begins_on: todayISO(), employee: params.get("employee") ?? undefined }),
  linkEffects: {
    employee: (emp) => employeeInfo(emp, ["designation", "resignation_letter_date"]),
    employee_separation_template: async (tpl) => {
      const t = await postCall<{ activities?: Record<string, unknown>[] }>("frappe.client.get", { doctype: "Employee Separation Template", name: tpl }).catch(() => null);
      return t?.activities ? { activities: t.activities.map(({ activity_name, user, role, begin_on, duration }) => ({ activity_name, user, role, begin_on, duration })) } : undefined;
    },
  },
  titleOf: (v) => v.employee_name || "New separation",
};

export const EXPENSE_CLAIM_TYPE_CONFIG: DocConfig = {
  doctype: "Expense Claim Type",
  base: "/hr/expense-claim-types",
  singular: "Expense Claim Type",
  plural: "Expense Claim Types",
  subtitle: "Travel, food, fuel… and the expense account each one books to",
  icon: Receipt,
  companyScoped: false,
  listFields: ["name", "description", "deferred_expense_account", "modified"],
  columns: [nameCol("Expense Type", (r) => r.description), yesNoCol("deferred_expense_account", "Deferred")],
  searchFields: ["name", "description"],
  sort: { key: "name", dir: "asc" },
  fields: [sec("Expense type"), when(req(data("expense_type", "Expense Claim Type")), (v) => !v.name), text("description", "Description"), check("deferred_expense_account", "Deferred Expense Account")],
  children: [
    {
      key: "accounts",
      label: "Accounts",
      description: "The default expense account per company.",
      doctype: "Expense Claim Account",
      columns: [req(link("company", "Company", "Company")), req(link("default_account", "Default Account", "Account"))],
    },
  ],
};

/* ============================================================================ Payroll extras */

export const GRATUITY_RULE_CONFIG: DocConfig = {
  doctype: "Gratuity Rule",
  base: "/payroll/gratuity-rules",
  singular: "Gratuity Rule",
  plural: "Gratuity Rules",
  subtitle: "How end-of-service gratuity is calculated from years of service",
  icon: Award,
  companyScoped: false,
  listFields: ["name", "calculate_gratuity_amount_based_on", "minimum_year_for_gratuity", "total_working_days_per_year", "disable", "modified"],
  columns: [nameCol("Rule"), textCol("calculate_gratuity_amount_based_on", "Based On"), numCol("minimum_year_for_gratuity", "Min. Years", 0), yesNoCol("disable", "Status", "Disabled", "Enabled")],
  searchFields: ["name"],
  sort: { key: "name", dir: "asc" },
  fields: [
    sec("Rule"),
    when(req(data("__newname", "Rule Name")), (v) => !v.name),
    req(select("calculate_gratuity_amount_based_on", "Calculate Gratuity Amount Based On", ["Current Slab", "Sum of all previous slabs"])),
    select("work_experience_calculation_function", "Work Experience Calculation", ["Round off Work Experience", "Take Exact Completed Years", "Manual"]),
    colBreak(),
    float("total_working_days_per_year", "Total Working Days Per Year"),
    int("minimum_year_for_gratuity", "Minimum Years for Gratuity"),
    check("disable", "Disable"),
  ],
  children: [
    {
      key: "applicable_earnings_component",
      label: "Applicable earnings",
      description: "Salary components the gratuity is a fraction of.",
      doctype: "Gratuity Applicable Component",
      columns: [req(link("salary_component", "Salary Component", "Salary Component"))],
      minRows: 1,
    },
    {
      key: "gratuity_rule_slabs",
      label: "Slabs",
      description: "Fraction of the applicable earnings paid per year of service, by experience band (To Year 0 = no upper limit).",
      doctype: "Gratuity Rule Slab",
      columns: [int("from_year", "From Year"), req(int("to_year", "To Year")), req(float("fraction_of_applicable_earnings", "Fraction of Applicable Earnings"))],
      minRows: 1,
      newRow: (_v, rows) => ({ from_year: asNumber(rows[rows.length - 1]?.to_year), to_year: 0, fraction_of_applicable_earnings: 1 }),
    },
  ],
  defaults: () => ({ calculate_gratuity_amount_based_on: "Current Slab", work_experience_calculation_function: "Round off Work Experience", total_working_days_per_year: 365, minimum_year_for_gratuity: 1 }),
};

const payComponent = (doctype: string, base: string, plural: string, subtitle: string, icon: DocConfig["icon"], amountField: string, dateField: string, dateLabel: string): DocConfig => ({
  doctype,
  base,
  singular: doctype,
  plural,
  subtitle,
  icon,
  submittable: true,
  listFields: ["name", "employee", "employee_name", "department", "salary_component", amountField, "currency", dateField, "docstatus", "modified"],
  columns: [employeeCol, textCol("salary_component", "Component"), { key: amountField, label: "Amount", align: "right", getValue: (r) => asNumber(r[amountField]), render: (r) => `${r.currency ?? ""} ${asNumber(r[amountField]).toLocaleString()}` }, dateCol(dateField, dateLabel), docstatusCol()],
  searchFields: ["name", "employee", "employee_name", "salary_component"],
  dateField,
  dateLabel,
  sort: { key: dateField, dir: "desc" },
  fields: [
    sec(doctype),
    req(link("employee", "Employee", "Employee")),
    ro(data("employee_name", "Employee Name")),
    ro(link("department", "Department", "Department")),
    req(link("company", "Company", "Company")),
    colBreak(),
    req(link("salary_component", "Salary Component", "Salary Component")),
    req(currency(amountField, "Amount")),
    req(date(dateField, dateLabel)),
    ro(link("currency", "Currency", "Currency")),
  ],
  defaults: ({ company }) => ({ company, [dateField]: todayISO() }),
  linkEffects: {
    employee: async (emp) => {
      const i = await employeeInfo(emp, ["salary_currency"]);
      return { ...i, currency: i.salary_currency };
    },
  },
  titleOf: (v) => [v.employee_name, v.salary_component].filter(Boolean).join(" · "),
});

export const EMPLOYEE_INCENTIVE_CONFIG = payComponent("Employee Incentive", "/payroll/incentives", "Incentives", "Production and performance incentives, paid through the salary slip", BadgeCheck, "incentive_amount", "payroll_date", "Payroll date");
export const RETENTION_BONUS_CONFIG = payComponent("Retention Bonus", "/payroll/retention-bonus", "Retention Bonuses", "Bonuses paid to keep key staff, on a set payment date", Award, "bonus_amount", "bonus_payment_date", "Payment date");

export const SALARY_WITHHOLDING_CONFIG: DocConfig = {
  doctype: "Salary Withholding",
  base: "/payroll/salary-withholding",
  singular: "Salary Withholding",
  plural: "Salary Withholdings",
  subtitle: "Hold an employee's salary for a number of payroll cycles (e.g. pending clearance)",
  icon: XCircle,
  submittable: true,
  listFields: ["name", "employee", "employee_name", "from_date", "to_date", "number_of_withholding_cycles", "status", "docstatus", "modified"],
  columns: [employeeCol, dateCol("from_date", "From"), dateCol("to_date", "To"), numCol("number_of_withholding_cycles", "Cycles", 0), statusCol("status", "Status", "Draft")],
  searchFields: ["name", "employee", "employee_name"],
  statusField: "status",
  statuses: ["Draft", "Withheld", "Released", "Cancelled"],
  dateField: "from_date",
  dateLabel: "From",
  sort: { key: "from_date", dir: "desc" },
  fields: [
    sec("Withholding"),
    req(link("employee", "Employee", "Employee")),
    ro(data("employee_name", "Employee Name")),
    ro(link("company", "Company", "Company")),
    ro(select("payroll_frequency", "Payroll Frequency", ["", "Monthly", "Fortnightly", "Bimonthly", "Weekly", "Daily"])),
    colBreak(),
    req(date("posting_date", "Posting Date")),
    req(date("from_date", "From Date")),
    req(int("number_of_withholding_cycles", "Number of Withholding Cycles")),
    ro(date("to_date", "To Date")),
    sec("Reason"),
    text("reason_for_withholding_salary", "Reason for Withholding Salary"),
  ],
  children: [{ key: "cycles", label: "Cycles", doctype: "Salary Withholding Cycle", columns: [date("from_date", "From"), date("to_date", "To"), check("is_salary_released", "Released"), link("journal_entry", "Journal Entry", "Journal Entry")], readOnly: true }],
  defaults: () => ({ posting_date: todayISO(), from_date: todayISO(), number_of_withholding_cycles: 1 }),
  linkEffects: { employee: (emp) => employeeInfo(emp) },
  omitOnSave: ["status"],
  titleOf: (v) => v.employee_name || "New withholding",
};

export const TAX_DECLARATION_CONFIG: DocConfig = {
  doctype: "Employee Tax Exemption Declaration",
  base: "/payroll/tax-declarations",
  singular: "Tax Exemption Declaration",
  plural: "Tax Exemption Declarations",
  subtitle: "What each employee declares for tax exemption in a payroll period",
  icon: ShieldCheck,
  submittable: true,
  listFields: ["name", "employee", "employee_name", "payroll_period", "total_declared_amount", "total_exemption_amount", "docstatus", "modified"],
  columns: [employeeCol, textCol("payroll_period", "Payroll Period"), moneyCol("total_declared_amount", "Declared"), moneyCol("total_exemption_amount", "Exempt"), docstatusCol()],
  searchFields: ["name", "employee", "employee_name"],
  sort: { key: "modified", dir: "desc" },
  filters: [{ field: "payroll_period", label: "Payroll Period", optionsFrom: "Payroll Period" }],
  fields: [
    sec("Declaration"),
    req(link("employee", "Employee", "Employee")),
    ro(data("employee_name", "Employee Name")),
    ro(link("department", "Department", "Department")),
    link("company", "Company", "Company"),
    colBreak(),
    req(link("payroll_period", "Payroll Period", "Payroll Period")),
    req(link("currency", "Currency", "Currency")),
    ro(currency("total_declared_amount", "Total Declared Amount")),
    ro(currency("total_exemption_amount", "Total Exemption Amount")),
  ],
  children: [
    {
      key: "declarations",
      label: "Declarations",
      doctype: "Employee Tax Exemption Declaration Category",
      columns: [req(link("exemption_sub_category", "Sub Category", "Employee Tax Exemption Sub Category")), ro(link("exemption_category", "Category", "Employee Tax Exemption Category")), ro(currency("max_amount", "Max Amount")), req(currency("amount", "Declared Amount"))],
      linkEffects: {
        exemption_sub_category: async (sub) => {
          const v = await getLinkedValues("Employee Tax Exemption Sub Category", sub, ["exemption_category", "max_amount"]);
          return { exemption_category: v.exemption_category, max_amount: v.max_amount };
        },
      },
      totals: (rows) => [{ label: "Total declared", value: rows.reduce((a, r) => a + asNumber(r.amount), 0).toLocaleString(), align: "right" }],
    },
  ],
  defaults: ({ company }) => ({ company, currency: "PKR" }),
  linkEffects: {
    employee: async (emp) => {
      const i = await employeeInfo(emp, ["salary_currency"]);
      return { ...i, ...(i.salary_currency ? { currency: i.salary_currency } : {}) };
    },
  },
  titleOf: (v) => [v.employee_name, v.payroll_period].filter(Boolean).join(" · "),
};

/* ============================================================================ Overtime */

export const OVERTIME_TYPE_CONFIG: DocConfig = {
  doctype: "Overtime Type",
  base: "/payroll/overtime-types",
  singular: "Overtime Type",
  plural: "Overtime Types",
  subtitle: "How overtime is paid — multiplier on salary components, or a fixed hourly rate",
  icon: Hourglass,
  companyScoped: false,
  listFields: ["name", "overtime_calculation_method", "standard_multiplier", "weekend_multiplier", "public_holiday_multiplier", "hourly_rate", "maximum_overtime_hours_allowed", "overtime_salary_component", "modified"],
  columns: [
    nameCol("Overtime Type", (r) => r.overtime_salary_component),
    textCol("overtime_calculation_method", "Method"),
    { key: "standard_multiplier", label: "Multiplier", align: "right", render: (r) => `${asNumber(r.standard_multiplier)}×` },
    numCol("maximum_overtime_hours_allowed", "Max hours / day", 1),
  ],
  searchFields: ["name", "overtime_salary_component"],
  sort: { key: "name", dir: "asc" },
  fields: [
    sec("Overtime Type"),
    when(req(data("__newname", "Name")), (v) => !v.name),
    req(link("overtime_salary_component", "Overtime Salary Component", "Salary Component")),
    select("overtime_calculation_method", "Calculation Method", ["Salary Component Based", "Fixed Hourly Rate"]),
    when(currency("hourly_rate", "Hourly Rate"), (v) => v.overtime_calculation_method === "Fixed Hourly Rate"),
    float("maximum_overtime_hours_allowed", "Maximum Overtime Hours Allowed (per day)"),
    colBreak(),
    req(float("standard_multiplier", "Standard Multiplier")),
    check("applicable_for_weekend", "Applicable for Weekend"),
    when(float("weekend_multiplier", "Weekend Multiplier"), (v) => Boolean(v.applicable_for_weekend)),
    check("applicable_for_public_holiday", "Applicable for Public Holiday"),
    when(float("public_holiday_multiplier", "Public Holiday Multiplier"), (v) => Boolean(v.applicable_for_public_holiday)),
  ],
  children: [
    {
      key: "applicable_salary_component",
      label: "Applicable salary components",
      description: "For Salary Component Based: the hourly rate is worked out from these components.",
      doctype: "Overtime Salary Component",
      columns: [req(link("salary_component", "Salary Component", "Salary Component"))],
      showIf: (v) => v.overtime_calculation_method !== "Fixed Hourly Rate",
    },
  ],
  defaults: () => ({ overtime_calculation_method: "Salary Component Based", standard_multiplier: 1.5, weekend_multiplier: 2, public_holiday_multiplier: 2, maximum_overtime_hours_allowed: 4 }),
  connections: false,
};

export const OVERTIME_SLIP_CONFIG: DocConfig = {
  doctype: "Overtime Slip",
  base: "/payroll/overtime-slips",
  singular: "Overtime Slip",
  plural: "Overtime Slips",
  subtitle: "Overtime per employee per payroll period — paid through the salary slip",
  icon: Hourglass,
  submittable: true,
  listFields: ["name", "employee", "employee_name", "department", "start_date", "end_date", "total_overtime_duration", "salary_slip", "docstatus", "modified"],
  columns: [employeeCol, { key: "department", label: "Department", render: (r) => strip(r.department) }, dateCol("start_date", "From"), dateCol("end_date", "To"), { key: "total_overtime_duration", label: "Hours", align: "right", getValue: (r) => asNumber(r.total_overtime_duration), render: (r) => `${asNumber(r.total_overtime_duration).toFixed(1)} h` }, textCol("salary_slip", "Salary Slip"), docstatusCol()],
  searchFields: ["name", "employee", "employee_name"],
  dateField: "start_date",
  dateLabel: "Period start",
  sort: { key: "start_date", dir: "desc" },
  fields: [
    sec("Overtime slip"),
    req(link("employee", "Employee", "Employee")),
    data("employee_name", "Employee Name"),
    link("department", "Department", "Department"),
    req(link("company", "Company", "Company")),
    colBreak(),
    req(date("posting_date", "Posting Date")),
    req(date("start_date", "Start Date")),
    req(date("end_date", "End Date")),
    ro(float("total_overtime_duration", "Total Overtime (hours)")),
    ro(link("salary_slip", "Salary Slip", "Salary Slip")),
    ro(link("payroll_entry", "Payroll Entry", "Payroll Entry")),
  ],
  children: [
    {
      key: "overtime_details",
      label: "Overtime details",
      doctype: "Overtime Details",
      columns: [req(date("date", "Date")), req(link("overtime_type", "Overtime Type", "Overtime Type")), req(float("overtime_duration", "Hours")), req(float("standard_working_hours", "Standard Hours")), ro(link("reference_document", "Attendance", "Attendance"))],
      minRows: 1,
      totals: (rows) => [{ label: "Total hours", value: rows.reduce((a, r) => a + asNumber(r.overtime_duration), 0).toFixed(1), align: "right" }],
    },
  ],
  defaults: ({ company }) => ({ company, posting_date: todayISO() }),
  linkEffects: { employee: (emp) => employeeInfo(emp) },
  titleOf: (v) => v.employee_name || "New overtime slip",
};

/* ============================================================================ Settings */

export const HR_SETTINGS_CONFIG: DocConfig = {
  doctype: "HR Settings",
  base: "/hr/settings",
  singular: "HR Settings",
  plural: "HR Settings",
  subtitle: "Employee naming, reminders, leave and expense approvals, shifts, exit and hiring",
  icon: Settings2,
  single: true,
  companyScoped: false,
  listFields: [],
  columns: [],
  searchFields: [],
  fields: [
    tab("Employee"),
    sec("Employee"),
    select("emp_created_by", "Employee Naming By", ["Naming Series", "Employee Number", "Full Name"]),
    float("standard_working_hours", "Standard Working Hours"),
    colBreak(),
    data("retirement_age", "Retirement Age (years)"),
    sec("Reminders"),
    check("send_work_anniversary_reminders", "Work Anniversaries"),
    check("send_birthday_reminders", "Birthdays"),
    check("send_holiday_reminders", "Holidays"),
    when(select("frequency", "Holiday Reminder Frequency", ["Weekly", "Monthly"]), (v) => Boolean(v.send_holiday_reminders)),
    colBreak(),
    link("sender", "Sender (Email Account)", "Email Account"),
    when(ro(data("sender_email", "Sender Email")), (v) => Boolean(v.sender)),
    tab("Leaves"),
    sec("Leave"),
    check("leave_approver_mandatory_in_leave_application", "Leave Approver Mandatory in Leave Application"),
    check("prevent_self_leave_approval", "Prevent Self Leave Approval"),
    check("show_leaves_of_all_department_members_in_calendar", "Show Leaves of All Department Members in Calendar"),
    check("auto_leave_encashment", "Auto Leave Encashment"),
    colBreak(),
    check("restrict_backdated_leave_application", "Restrict Backdated Leave Application"),
    when(link("role_allowed_to_create_backdated_leave_application", "Role Allowed to Create Backdated Leave", "Role"), (v) => Boolean(v.restrict_backdated_leave_application)),
    check("send_leave_notification", "Send Leave Notification"),
    when(link("leave_approval_notification_template", "Leave Approval Notification Template", "Email Template"), (v) => Boolean(v.send_leave_notification)),
    when(link("leave_status_notification_template", "Leave Status Notification Template", "Email Template"), (v) => Boolean(v.send_leave_notification)),
    tab("Expenses"),
    sec("Expense claims & advances"),
    check("expense_approver_mandatory_in_expense_claim", "Expense Approver Mandatory in Expense Claim"),
    check("prevent_self_expense_approval", "Prevent Self Expense Approval"),
    colBreak(),
    check("unlink_payment_on_cancellation_of_employee_advance", "Unlink Payment on Cancellation of Employee Advance"),
    check("enable_multi_currency_expense_claim", "Enable Multi-currency Expense Claim"),
    tab("Shift & Attendance"),
    sec("Shifts"),
    check("allow_multiple_shift_assignments", "Allow Multiple Shift Assignments for the Same Date"),
    sec("Check-in"),
    check("allow_employee_checkin_from_mobile_app", "Allow Employee Check-in from Mobile App"),
    colBreak(),
    check("allow_geolocation_tracking", "Allow Geolocation Tracking"),
    tab("Exit"),
    sec("Employee exit"),
    link("exit_questionnaire_web_form", "Exit Questionnaire Web Form", "Web Form"),
    colBreak(),
    link("exit_questionnaire_notification_template", "Exit Questionnaire Notification Template", "Email Template"),
    tab("Recruitment"),
    sec("Hiring"),
    check("check_vacancies", "Check Vacancies on Job Offer Creation"),
    check("send_interview_reminder", "Send Interview Reminder"),
    when(link("interview_reminder_template", "Interview Reminder Template", "Email Template"), (v) => Boolean(v.send_interview_reminder)),
    when(time("remind_before", "Remind Before"), (v) => Boolean(v.send_interview_reminder)),
    check("send_interview_feedback_reminder", "Send Interview Feedback Reminder"),
    when(link("feedback_reminder_notification_template", "Feedback Reminder Template", "Email Template"), (v) => Boolean(v.send_interview_feedback_reminder)),
    colBreak(),
    link("hiring_sender", "Hiring Sender (Email Account)", "Email Account"),
    when(ro(data("hiring_sender_email", "Hiring Sender Email")), (v) => Boolean(v.hiring_sender)),
    tab("Salary Loans"),
    sec("Who may borrow and how much"),
    text("mm_loan_employment_types", "Eligible Employment Types", { description: "One per line, e.g. Full-time." }),
    int("mm_loan_min_service_months", "Minimum Service (months)"),
    float("mm_loan_salary_multiple", "Maximum Loan (× average gross salary)"),
    colBreak(),
    float("mm_loan_max_installment_pct", "Maximum Instalment (% of average net pay)"),
    int("mm_loan_max_months", "Maximum Tenure (months)"),
    int("mm_loan_max_active", "Other Loans Allowed While One Is Outstanding"),
    sec("Guarantor and recovery"),
    select("mm_loan_guarantor_required", "Guarantor Required", ["Always", "Above one month's gross salary", "Never"]),
    int("mm_loan_guarantor_min_service_months", "Guarantor Minimum Service (months)"),
    colBreak(),
    int("mm_loan_guarantor_max_guarantees", "Loans One Guarantor May Back"),
    link("mm_loan_component", "Recovery Salary Component", "Salary Component", { description: "Default: Loan Recovery (created automatically)." }),
  ],
  connections: false,
};

export const PAYROLL_SETTINGS_CONFIG: DocConfig = {
  doctype: "Payroll Settings",
  base: "/payroll/settings",
  singular: "Payroll Settings",
  plural: "Payroll Settings",
  subtitle: "Working days, salary slip emails, accounting and overtime slips",
  icon: Settings2,
  single: true,
  companyScoped: false,
  listFields: [],
  columns: [],
  searchFields: [],
  fields: [
    tab("Working Days"),
    sec("Payment days"),
    select("payroll_based_on", "Calculate Payroll Working Days Based On", ["Leave", "Attendance"]),
    when(select("consider_unmarked_attendance_as", "Consider Unmarked Attendance As", ["Present", "Absent"]), (v) => v.payroll_based_on === "Attendance"),
    check("include_holidays_in_total_working_days", "Include Holidays in Total Working Days"),
    when(check("consider_marked_attendance_on_holidays", "Consider Marked Attendance on Holidays"), (v) => Boolean(v.include_holidays_in_total_working_days)),
    colBreak(),
    float("max_working_hours_against_timesheet", "Max Working Hours Against Timesheet"),
    float("daily_wages_fraction_for_half_day", "Fraction of Daily Salary for Half Day"),
    sec("Salary slip"),
    check("disable_rounded_total", "Disable Rounded Total"),
    colBreak(),
    check("show_leave_balances_in_salary_slip", "Show Leave Balances in Salary Slip"),
    tab("Email"),
    sec("Email salary slips"),
    check("email_salary_slip_to_employee", "Email Salary Slip to Employee"),
    when(link("sender", "Sender", "Email Account"), (v) => Boolean(v.email_salary_slip_to_employee)),
    when(link("sender_copy", "Send Copy To", "Email Account"), (v) => Boolean(v.email_salary_slip_to_employee)),
    when(link("email_template", "Email Template", "Email Template"), (v) => Boolean(v.email_salary_slip_to_employee)),
    colBreak(),
    when(check("encrypt_salary_slips_in_emails", "Encrypt Salary Slips in Emails"), (v) => Boolean(v.email_salary_slip_to_employee)),
    when(data("password_policy", "Password Policy (e.g. {date_of_birth.year}{employee_name[:3]})"), (v) => Boolean(v.encrypt_salary_slips_in_emails)),
    tab("Other"),
    sec("Accounting & overtime"),
    check("process_payroll_accounting_entry_based_on_employee", "Process Payroll Accounting Entry Based on Employee"),
    check("mandatory_benefit_application", "Make Benefit Application Mandatory"),
    colBreak(),
    check("create_overtime_slip", "Create Overtime Slips with the Payroll Entry"),
  ],
  connections: false,
};

/* ============================================================================ Leave Application / Expense Claim (detail pages) */
// The list screens are hand-built (LeaveApplicationsPage, ExpenseClaimsPage); these give each record a React page —
// opened from lists, the approvals inbox and links — with the workflow / submit actions of the shared form.

export const LEAVE_APPLICATION_CONFIG: DocConfig = {
  doctype: "Leave Application",
  base: "/hr/leave-applications",
  singular: "Leave Application",
  plural: "Leave Applications",
  subtitle: "Leave requested by an employee, approved or rejected by the leave approver",
  icon: CalendarHeart,
  submittable: true,
  listFields: ["name", "employee", "employee_name", "leave_type", "from_date", "to_date", "total_leave_days", "status", "docstatus", "modified"],
  columns: [employeeCol, textCol("leave_type", "Leave Type"), dateCol("from_date", "From"), dateCol("to_date", "To"), statusCol("status", "Status", "Open")],
  searchFields: ["name", "employee", "employee_name"],
  statusField: "status",
  statuses: ["Open", "Approved", "Rejected", "Cancelled"],
  dateField: "from_date",
  dateLabel: "From",
  sort: { key: "from_date", dir: "desc" },
  fields: [
    sec("Request"),
    req(link("employee", "Employee", "Employee")),
    ro(data("employee_name", "Employee Name")),
    ro(link("department", "Department", "Department")),
    req(link("company", "Company", "Company")),
    req(link("leave_type", "Leave Type", "Leave Type")),
    colBreak(),
    req(date("from_date", "From Date")),
    req(date("to_date", "To Date")),
    check("half_day", "Half Day"),
    ro(float("total_leave_days", "Total Leave Days")),
    ro(float("leave_balance", "Leave Balance Before Application")),
    sec("Approval"),
    req(link("leave_approver", "Leave Approver", "User")),
    ro(data("leave_approver_name", "Approver Name")),
    colBreak(),
    select("status", "Status", ["Open", "Approved", "Rejected", "Cancelled"]),
    date("posting_date", "Posting Date"),
    sec("Reason"),
    text("description", "Reason"),
  ],
  defaults: ({ company }) => ({ company, posting_date: todayISO(), from_date: todayISO(), to_date: todayISO(), status: "Open" }),
  linkEffects: { employee: (emp) => employeeInfo(emp, ["leave_approver"]) },
};

export const EXPENSE_CLAIM_CONFIG: DocConfig = {
  doctype: "Expense Claim",
  base: "/hr/expense-claims",
  singular: "Expense Claim",
  plural: "Expense Claims",
  subtitle: "Expenses an employee paid for the company, approved by the expense approver and reimbursed",
  icon: Receipt,
  submittable: true,
  listFields: ["name", "employee", "employee_name", "posting_date", "total_claimed_amount", "approval_status", "status", "docstatus", "modified"],
  columns: [employeeCol, dateCol("posting_date", "Date"), moneyCol("total_claimed_amount", "Claimed"), statusCol("approval_status", "Approval", "Draft"), statusCol("status", "Status", "Draft")],
  searchFields: ["name", "employee", "employee_name"],
  statusField: "approval_status",
  statuses: ["Draft", "Approved", "Rejected"],
  dateField: "posting_date",
  sort: { key: "posting_date", dir: "desc" },
  fields: [
    sec("Claim"),
    req(link("employee", "Employee", "Employee")),
    ro(data("employee_name", "Employee Name")),
    ro(link("department", "Department", "Department")),
    req(link("company", "Company", "Company")),
    colBreak(),
    req(date("posting_date", "Posting Date")),
    req(link("expense_approver", "Expense Approver", "User")),
    select("approval_status", "Approval Status", ["Draft", "Approved", "Rejected"]),
    ro(data("status", "Status")),
    sec("Totals"),
    ro(currency("total_claimed_amount", "Total Claimed")),
    ro(currency("total_sanctioned_amount", "Total Sanctioned")),
    colBreak(),
    ro(currency("grand_total", "Grand Total")),
    ro(currency("total_amount_reimbursed", "Reimbursed")),
    sec("Accounting"),
    link("payable_account", "Payable Account", "Account"),
    colBreak(),
    link("cost_center", "Cost Center", "Cost Center"),
    text("remark", "Remark"),
  ],
  children: [
    {
      key: "expenses",
      label: "Expenses",
      doctype: "Expense Claim Detail",
      minRows: 1,
      columns: [
        req(date("expense_date", "Date")),
        req(link("expense_type", "Expense Claim Type", "Expense Claim Type")),
        data("description", "Description"),
        req(currency("amount", "Amount")),
        currency("sanctioned_amount", "Sanctioned"),
        link("cost_center", "Cost Center", "Cost Center"),
      ],
      newRow: () => ({ expense_date: todayISO() }),
      totals: (rows) => [{ label: "Claimed", value: rows.reduce((s, r) => s + asNumber(r.amount), 0).toLocaleString(), align: "right" }],
    },
  ],
  defaults: ({ company }) => ({ company, posting_date: todayISO(), approval_status: "Draft" }),
  linkEffects: { employee: (emp) => employeeInfo(emp, ["expense_approver"]) },
};


/* ============================================================================ Employee Advance (+ salary loan) */
// Detail page for advances; the list stays the hand-built EmployeeAdvancesPage. A "salary loan" is an advance
// repaid in monthly instalments from salary — mm_core.loans checks the loan policy (live panel below, enforced on submit).

export const EMPLOYEE_ADVANCE_CONFIG: DocConfig = {
  doctype: "Employee Advance",
  base: "/hr/advances",
  singular: "Employee Advance",
  plural: "Employee Advances",
  subtitle: "Cash advance or salary loan to an employee — loans are recovered in monthly instalments from salary",
  icon: Coins,
  submittable: true,
  listFields: ["name", "employee", "employee_name", "posting_date", "advance_amount", "paid_amount", "return_amount", "status", "mm_is_loan", "docstatus"],
  columns: [employeeCol, dateCol("posting_date", "Date"), moneyCol("advance_amount", "Amount"), moneyCol("return_amount", "Repaid"), statusCol("status", "Status", "Draft")],
  searchFields: ["name", "employee", "employee_name"],
  statusField: "status",
  statuses: ["Draft", "Unpaid", "Paid", "Claimed", "Returned", "Partly Claimed and Returned", "Cancelled"],
  dateField: "posting_date",
  sort: { key: "posting_date", dir: "desc" },
  fields: [
    sec("Advance"),
    req(link("employee", "Employee", "Employee")),
    ro(data("employee_name", "Employee Name")),
    ro(link("department", "Department", "Department")),
    req(link("company", "Company", "Company")),
    colBreak(),
    req(date("posting_date", "Posting Date")),
    req(currency("advance_amount", "Amount")),
    req(link("currency", "Currency", "Currency")),
    req(link("advance_account", "Advance Account", "Account")),
    link("mode_of_payment", "Mode of Payment", "Mode of Payment"),
    sec("Purpose"),
    req(text("purpose", "Purpose")),
    sec("Salary Loan"),
    check("mm_is_loan", "Salary loan (repay in instalments from salary)"),
    when(int("mm_installment_months", "Instalments (months)"), (v) => Boolean(v.mm_is_loan)),
    when(ro(currency("mm_monthly_installment", "Monthly Instalment")), (v) => Boolean(v.mm_is_loan)),
    when(date("mm_first_deduction", "First Deduction Month"), (v) => Boolean(v.mm_is_loan)),
    colBreak(),
    when(link("mm_guarantor", "Guarantor", "Employee"), (v) => Boolean(v.mm_is_loan)),
    when(ro(data("mm_guarantor_name", "Guarantor Name")), (v) => Boolean(v.mm_is_loan)),
    when(text("mm_override_reason", "Override Reason (HR Manager)", { description: "Only to approve a loan that fails the policy." }), (v) => Boolean(v.mm_is_loan)),
    sec("Repayment"),
    ro(currency("paid_amount", "Paid")),
    ro(currency("claimed_amount", "Claimed (expenses)")),
    colBreak(),
    ro(currency("return_amount", "Repaid")),
    ro(currency("pending_amount", "Pending")),
    ro(data("status", "Status")),
  ],
  defaults: ({ company }) => ({ company, posting_date: todayISO(), currency: "PKR", exchange_rate: 1 }),
  linkEffects: {
    employee: (emp) => employeeInfo(emp),
    mm_guarantor: async (emp) => ({ mm_guarantor_name: emp ? (await employeeInfo(emp)).employee_name : "" }),
    company: async (c) => {
      const v = c ? await getLinkedValues("Company", c, ["default_employee_advance_account", "default_currency"]) : {};
      return { advance_account: v?.default_employee_advance_account, currency: v?.default_currency || "PKR" };
    },
  },
  actions: [
    { label: "Pay out", group: "create", make: "hrms.overrides.employee_payment_entry.get_payment_entry_for_employee",
      makeArgs: (c) => ({ dt: "Employee Advance", dn: c.name }),
      show: (c) => c.docstatus === 1 && Number(c.values.paid_amount ?? 0) < Number(c.values.advance_amount ?? 0) },
    { label: "Set up instalments", icon: CalendarRange,
      show: (c) => c.docstatus === 1 && Boolean(c.values.mm_is_loan) && Number(c.values.paid_amount ?? 0) > 0,
      run: async (c) => {
        try {
          const r = await postCall<{ message?: string }>("mm_core.loans.create_installments", { advance: c.name });
          toast.success(`Instalments: ${(r as { message?: string })?.message ?? "set up"}`);
          notifyDataChanged();
          c.reload();
        } catch (e) {
          toast.error(humanizeError(e));
        }
      } },
  ],
  extra: (c) => <LoanEligibilityPanel values={c.values} name={c.name} />,
};


/* ============================================================================ Shift Location / Schedule / Schedule Assignment */
export const SHIFT_LOCATION_CONFIG: DocConfig = {
  doctype: "Shift Location",
  base: "/hr/shift-locations",
  singular: "Shift Location",
  plural: "Shift Locations",
  subtitle: "Where a shift is worked — check-ins are allowed within the radius of these coordinates",
  icon: MapPin,
  companyScoped: false,
  listFields: ["name", "location_name", "latitude", "longitude", "checkin_radius", "modified"],
  columns: [nameCol("Location"), { key: "latitude", label: "Coordinates", render: (r) => (r.latitude ? <a className="font-mono text-xs text-primary hover:underline" href={`https://www.google.com/maps?q=${r.latitude},${r.longitude}`} target="_blank" rel="noreferrer">{Number(r.latitude).toFixed(5)}, {Number(r.longitude).toFixed(5)}</a> : "—") },
    textCol("checkin_radius", "Radius (m)", { align: "right" })],
  searchFields: ["name", "location_name"],
  sort: { key: "location_name", dir: "asc" },
  fields: [
    sec("Location"),
    req(data("location_name", "Location Name")),
    int("checkin_radius", "Check-in Radius (metres)"),
    colBreak(),
    float("latitude", "Latitude"),
    float("longitude", "Longitude"),
  ],
  actions: [
    {
      label: "Use this device's location", icon: MapPin, show: (c) => !c.readOnly,
      run: (c) => new Promise<void>((resolve) => {
        if (!navigator.geolocation) { toast.error("This browser can't share its location"); resolve(); return; }
        navigator.geolocation.getCurrentPosition(
          (pos) => { c.patch({ latitude: Number(pos.coords.latitude.toFixed(6)), longitude: Number(pos.coords.longitude.toFixed(6)) }); toast.success("Coordinates filled — save to keep them"); resolve(); },
          () => { toast.error("Couldn't get the location"); resolve(); }, { enableHighAccuracy: true, timeout: 15000 });
      }),
    },
  ],
  defaults: () => ({ checkin_radius: 150 }),
  extra: (c) => <ShiftLocationMap values={c.values} />,
};

export const SHIFT_SCHEDULE_CONFIG: DocConfig = {
  doctype: "Shift Schedule",
  base: "/hr/shift-schedules",
  singular: "Shift Schedule",
  plural: "Shift Schedules",
  subtitle: "A shift on chosen weekdays, repeating every week(s) — assign it to employees to generate their shifts",
  icon: CalendarRange,
  companyScoped: false,
  submittable: true,
  listFields: ["name", "shift_type", "frequency", "docstatus", "modified"],
  columns: [nameCol("Schedule", (r) => r.shift_type), textCol("shift_type", "Shift"), textCol("frequency", "Repeats"), docstatusCol()],
  searchFields: ["name", "shift_type"],
  sort: { key: "modified", dir: "desc" },
  fields: [
    sec("Schedule"),
    req(link("shift_type", "Shift Type", "Shift Type")),
    colBreak(),
    req(select("frequency", "Frequency", ["Every Week", "Every 2 Weeks", "Every 3 Weeks", "Every 4 Weeks"])),
  ],
  children: [
    { key: "repeat_on_days", label: "Repeat On Days", doctype: "Assignment Rule Day", minRows: 1,
      columns: [req(select("day", "Day", ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]))] },
  ],
  defaults: () => ({ frequency: "Every Week" }),
};

export const SHIFT_SCHEDULE_ASSIGNMENT_CONFIG: DocConfig = {
  doctype: "Shift Schedule Assignment",
  base: "/hr/shift-schedule-assignments",
  singular: "Shift Schedule Assignment",
  plural: "Shift Schedule Assignments",
  subtitle: "An employee on a repeating shift schedule — shift assignments are created ahead automatically",
  icon: CalendarClock,
  listFields: ["name", "employee", "employee_name", "shift_schedule", "shift_location", "shift_status", "enabled", "create_shifts_after", "modified"],
  columns: [employeeCol, textCol("shift_schedule", "Schedule"), textCol("shift_location", "Location"), statusCol("shift_status", "Status", "Active"), yesNoCol("enabled", "Enabled")],
  searchFields: ["name", "employee", "employee_name", "shift_schedule"],
  statusField: "shift_status",
  statuses: ["Active", "Inactive"],
  sort: { key: "modified", dir: "desc" },
  fields: [
    sec("Assignment"),
    req(link("employee", "Employee", "Employee")),
    ro(data("employee_name", "Employee Name")),
    req(link("company", "Company", "Company")),
    colBreak(),
    req(link("shift_schedule", "Shift Schedule", "Shift Schedule")),
    link("shift_location", "Shift Location", "Shift Location"),
    select("shift_status", "Shift Status", ["Active", "Inactive"]),
    date("create_shifts_after", "Create Shifts After"),
    check("enabled", "Enabled"),
  ],
  defaults: ({ company }) => ({ company, enabled: 1, shift_status: "Active", create_shifts_after: todayISO() }),
  linkEffects: { employee: (emp) => employeeInfo(emp) },
};
