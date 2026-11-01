/** Cashier shift report (A4 PDF from the server): X = the shift so far (counter open), Z = the closed shift with the count. */
import { postDownload } from "@/sc/lib/api";

export const printShiftReport = (session: string) =>
  postDownload("sugarcane.api.v1.counter.shift_report_pdf", { session }, `Shift report ${session}.pdf`);

export const printDailySummary = (day: string) =>
  postDownload("sugarcane.api.v1.counter.daily_summary_pdf", { day }, `Cashier summary ${day}.pdf`);
