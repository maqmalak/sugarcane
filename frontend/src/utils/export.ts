/**
 * Client-side data export to CSV and Excel files.
 * CSV/.xls stay dependency-free (standard delimited / HTML-table files that
 * Excel, Google Sheets and LibreOffice open directly); `.xlsx` uses SheetJS
 * (`xlsx`) to produce a real Excel workbook.
 */
import * as XLSX from "xlsx";

function escapeCell(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function buildCsv(columns: { key: string; label: string }[], rows: Record<string, unknown>[]): string {
  const header = columns.map((c) => escapeCell(c.label)).join(",");
  const body = rows
    .map((row) => columns.map((c) => escapeCell(row[c.key])).join(","))
    .join("\n");
  return `${header}\n${body}`;
}

function triggerDownload(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Export rows to a UTF-8 CSV file. */
export function exportToCsv(
  columns: { key: string; label: string }[],
  rows: Record<string, unknown>[],
  filename: string,
) {
  // BOM so Excel reads UTF-8 correctly.
  triggerDownload(`\uFEFF${buildCsv(columns, rows)}`, `${filename}.csv`, "text/csv;charset=utf-8;");
}

/**
 * Export to Excel using the legacy HTML-table format that Excel understands
 * (also opens in Google Sheets / LibreOffice). Self-contained, no library.
 */
export function exportToExcel(
  columns: { key: string; label: string }[],
  rows: Record<string, unknown>[],
  filename: string,
  _sheetName = "Sheet1",
) {
  const head = `<tr>${columns.map((c) => `<th>${escapeCell(c.label)}</th>`).join("")}</tr>`;
  const body = rows
    .map((r) => `<tr>${columns.map((c) => `<td>${escapeCell(r[c.key])}</td>`).join("")}</tr>`)
    .join("");
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="UTF-8"></head><body><table>${head}${body}</table></body></html>`;
  triggerDownload(html, `${filename}.xls`, "application/vnd.ms-excel");
}

/** Export rows to a real .xlsx workbook (SheetJS). */
export function exportToXlsx(
  columns: { key: string; label: string }[],
  rows: Record<string, unknown>[],
  filename: string,
  sheetName = "Sheet1",
) {
  const aoa = [columns.map((c) => c.label), ...rows.map((r) => columns.map((c) => r[c.key] ?? ""))];
  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, sheetName.slice(0, 31));
  XLSX.writeFile(workbook, `${filename}.xlsx`);
}