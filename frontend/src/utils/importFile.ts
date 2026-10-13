/**
 * Client-side import file parsing — reads a user-uploaded CSV or Excel
 * (.xlsx/.xls) file into plain rows keyed by the sheet's header row.
 * Built on SheetJS (`xlsx`), which parses both formats through the same API
 * so callers don't need to branch on file type.
 */
import * as XLSX from "xlsx";

export interface ParsedImportFile {
  /** Header cells from the sheet's first row, in column order. */
  headers: string[];
  /** One object per data row, keyed by header. Values are trimmed strings ("" for blank cells). */
  rows: Record<string, string>[];
}

const ACCEPTED_EXTENSIONS = [".csv", ".xlsx", ".xls"];

export function isSupportedImportFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext));
}

/** Parse an uploaded CSV or Excel file's first sheet into headers + row objects. */
export async function parseImportFile(file: File): Promise<ParsedImportFile> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return { headers: [], rows: [] };
  const sheet = workbook.Sheets[sheetName];

  const headerRow = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, range: 0, blankrows: false })[0] ?? [];
  const headers = headerRow.map((h) => String(h ?? "").trim()).filter(Boolean);

  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: false });
  const rows = rawRows.map((r) => {
    const out: Record<string, string> = {};
    for (const h of headers) out[h] = String(r[h] ?? "").trim();
    return out;
  });

  return { headers, rows };
}

/** Normalizes a header/label for fuzzy matching: lowercase, letters+digits only. */
export function normalizeHeader(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** True-ish parsing for imported boolean-like columns (is_group, disabled, ...). */
export function parseImportBoolean(value: string | undefined): 0 | 1 {
  const v = (value ?? "").trim().toLowerCase();
  return v === "1" || v === "yes" || v === "true" || v === "y" || v === "group" ? 1 : 0;
}
