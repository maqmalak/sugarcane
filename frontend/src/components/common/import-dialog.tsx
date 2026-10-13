import { useMemo, useState } from "react";
import { UploadCloud, FileSpreadsheet, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { humanizeError } from "@/services/frappe";
import { exportToCsv } from "@/utils/export";
import { parseImportFile, isSupportedImportFile, normalizeHeader, parseImportBoolean, type ParsedImportFile } from "@/utils/importFile";

export interface ImportFieldSpec {
  fieldname: string;
  label: string;
  required?: boolean;
  /** Parsed with truthy-string rules (1/yes/true/y) instead of passed through as text. */
  boolean?: boolean;
}

export interface ImportDialogProps {
  open: boolean;
  onClose: () => void;
  /** e.g. "Import Accounts" */
  title: string;
  fields: ImportFieldSpec[];
  /** One example row for the downloadable template, keyed by fieldname. */
  sampleRow?: Record<string, string>;
  /**
   * Creates one record from a fully-mapped, type-coerced row and returns the
   * server-assigned document name — required so hierarchical imports can
   * resolve child rows against a parent's *actual* name (which may differ
   * from the CSV value, e.g. ERPNext's "Name - Company Abbr" autoname).
   */
  onImportRow: (row: Record<string, unknown>) => Promise<{ name: string }>;
  /**
   * For self-referencing hierarchies (Chart of Accounts, Cost Center tree):
   * rows are imported parents-first, re-pointing each child's `parentField`
   * at the parent's real created name. Omit for flat doctypes.
   */
  hierarchy?: { keyField: string; parentField: string };
  /** Called after import finishes with at least one success, to refresh the list. */
  onImported: () => void;
}

type Step = "upload" | "map" | "result";

interface RowResult {
  index: number;
  ok: boolean;
  error?: string;
}

function buildRowPayload(
  row: Record<string, string>,
  mapping: Record<string, string>,
  fields: ImportFieldSpec[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    const header = mapping[f.fieldname];
    const raw = header ? row[header] ?? "" : "";
    if (f.boolean) {
      out[f.fieldname] = parseImportBoolean(raw);
    } else if (raw !== "") {
      out[f.fieldname] = raw;
    }
  }
  return out;
}

/**
 * Generic CSV/Excel bulk-import flow: upload → auto-detect column mapping
 * (editable) → preview → import with per-row results. Hierarchical doctypes
 * (self-referencing parent field) are imported in dependency order across
 * multiple passes so parents always exist before their children, regardless
 * of row order in the source file.
 */
export function ImportDialog({ open, onClose, title, fields, sampleRow, onImportRow, hierarchy, onImported }: ImportDialogProps) {
  const [step, setStep] = useState<Step>("upload");
  const [parsed, setParsed] = useState<ParsedImportFile | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [fileError, setFileError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<RowResult[]>([]);

  const reset = () => {
    setStep("upload");
    setParsed(null);
    setMapping({});
    setFileError(null);
    setResults([]);
  };

  const close = () => {
    reset();
    onClose();
  };

  const handleFile = async (file: File) => {
    setFileError(null);
    if (!isSupportedImportFile(file)) {
      setFileError("Unsupported file type. Please upload a .csv, .xlsx or .xls file.");
      return;
    }
    try {
      const result = await parseImportFile(file);
      if (result.rows.length === 0) {
        setFileError("No data rows found in that file.");
        return;
      }
      const autoMapping: Record<string, string> = {};
      for (const f of fields) {
        const target = normalizeHeader(f.label) || normalizeHeader(f.fieldname);
        const match = result.headers.find(
          (h) => normalizeHeader(h) === normalizeHeader(f.fieldname) || normalizeHeader(h) === target,
        );
        if (match) autoMapping[f.fieldname] = match;
      }
      setParsed(result);
      setMapping(autoMapping);
      setStep("map");
    } catch (e) {
      setFileError(humanizeError(e));
    }
  };

  const missingRequired = useMemo(
    () => fields.filter((f) => f.required && !mapping[f.fieldname]),
    [fields, mapping],
  );

  const runImport = async () => {
    if (!parsed) return;
    setImporting(true);
    setStep("result");
    const rows = parsed.rows.map((r) => buildRowPayload(r, mapping, fields));
    const rowResults: RowResult[] = [];
    let successCount = 0;

    if (hierarchy) {
      const pending = rows.map((row, index) => ({ index, row }));
      const createdKeyToName = new Map<string, string>();

      while (pending.length) {
        let progressed = false;
        for (let i = pending.length - 1; i >= 0; i--) {
          const { index, row } = pending[i];
          const parentRaw = String(row[hierarchy.parentField] ?? "").trim();
          const parentKey = parentRaw.toLowerCase();
          const waitingOnParent =
            parentRaw &&
            !createdKeyToName.has(parentKey) &&
            pending.some((p, j) => j !== i && String(p.row[hierarchy.keyField] ?? "").trim().toLowerCase() === parentKey);
          if (waitingOnParent) continue;

          const resolvedParent = parentRaw && createdKeyToName.has(parentKey) ? createdKeyToName.get(parentKey)! : parentRaw || undefined;
          try {
            const created = await onImportRow({ ...row, [hierarchy.parentField]: resolvedParent });
            const ownKey = String(row[hierarchy.keyField] ?? "").trim().toLowerCase();
            if (ownKey) createdKeyToName.set(ownKey, created.name);
            rowResults.push({ index, ok: true });
            successCount++;
          } catch (e) {
            rowResults.push({ index, ok: false, error: humanizeError(e) });
          }
          pending.splice(i, 1);
          progressed = true;
        }
        if (!progressed) {
          pending.forEach(({ index }) =>
            rowResults.push({ index, ok: false, error: "Parent row was never created — check its own error, or the parent name." }),
          );
          break;
        }
      }
    } else {
      for (let index = 0; index < rows.length; index++) {
        try {
          await onImportRow(rows[index]);
          rowResults.push({ index, ok: true });
          successCount++;
        } catch (e) {
          rowResults.push({ index, ok: false, error: humanizeError(e) });
        }
      }
    }

    rowResults.sort((a, b) => a.index - b.index);
    setResults(rowResults);
    setImporting(false);
    if (successCount > 0) onImported();
  };

  const downloadTemplate = () => {
    const columns = fields.map((f) => ({ key: f.fieldname, label: f.fieldname }));
    const row = sampleRow ?? {};
    exportToCsv(columns, [row], `${title.toLowerCase().replace(/\s+/g, "-")}-template`);
  };

  return (
    <Dialog open={open} onClose={close} size="lg" title={title}>
      <div className="space-y-5">
        {step === "upload" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Upload a CSV or Excel (.xlsx/.xls) file. Columns are matched to fields automatically — you can adjust the mapping on the next step.
            </p>
            <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-input p-8 text-center hover:bg-accent/50">
              <UploadCloud className="h-8 w-8 text-muted-foreground" />
              <span className="text-sm font-medium">Click to choose a file</span>
              <span className="text-xs text-muted-foreground">.csv, .xlsx or .xls</span>
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleFile(file);
                  e.target.value = "";
                }}
              />
            </label>
            {fileError && <p className="text-sm text-destructive">{fileError}</p>}
            <div className="flex items-center justify-between border-t pt-4">
              <button type="button" onClick={downloadTemplate} className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline">
                <FileSpreadsheet className="h-3.5 w-3.5" /> Download CSV template
              </button>
              <Button variant="outline" onClick={close}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {step === "map" && parsed && (
          <div className="space-y-4">
            <div className="grid gap-2">
              {fields.map((f) => (
                <div key={f.fieldname} className="grid grid-cols-2 items-center gap-3">
                  <span className="text-sm">
                    {f.label}
                    {f.required && <span className="text-destructive"> *</span>}
                  </span>
                  <Select
                    value={mapping[f.fieldname] ?? ""}
                    onChange={(e) => setMapping((m) => ({ ...m, [f.fieldname]: e.target.value }))}
                  >
                    <option value="">— Not imported —</option>
                    {parsed.headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </Select>
                </div>
              ))}
            </div>

            {missingRequired.length > 0 && (
              <p className="text-sm text-destructive">
                Missing mapping for required field{missingRequired.length > 1 ? "s" : ""}:{" "}
                {missingRequired.map((f) => f.label).join(", ")}
              </p>
            )}

            <div className="rounded-md border border-border">
              <div className="max-h-56 overflow-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-muted text-left">
                      {parsed.headers.map((h) => (
                        <th key={h} className="whitespace-nowrap px-2 py-1.5 font-semibold text-muted-foreground">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.rows.slice(0, 10).map((r, i) => (
                      <tr key={i} className="border-b border-border last:border-0">
                        {parsed.headers.map((h) => (
                          <td key={h} className="whitespace-nowrap px-2 py-1">
                            {r[h]}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="border-t border-border px-2 py-1.5 text-xs text-muted-foreground">
                {parsed.rows.length} row{parsed.rows.length === 1 ? "" : "s"} found{parsed.rows.length > 10 ? " — showing first 10" : ""}
              </p>
            </div>

            <div className="flex justify-end gap-2 border-t pt-4">
              <Button variant="outline" onClick={reset}>
                Back
              </Button>
              <Button onClick={runImport} disabled={missingRequired.length > 0}>
                Import {parsed.rows.length} row{parsed.rows.length === 1 ? "" : "s"}
              </Button>
            </div>
          </div>
        )}

        {step === "result" && parsed && (
          <div className="space-y-4">
            {importing ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Importing…
              </div>
            ) : (
              <p className="text-sm">
                <span className="font-medium text-emerald-600 dark:text-emerald-400">{results.filter((r) => r.ok).length} imported</span>
                {results.some((r) => !r.ok) && (
                  <span className="text-destructive"> · {results.filter((r) => !r.ok).length} failed</span>
                )}
              </p>
            )}
            <div className="max-h-72 overflow-auto rounded-md border border-border">
              <table className="w-full text-xs">
                <tbody>
                  {results.map((r) => (
                    <tr key={r.index} className="border-b border-border last:border-0">
                      <td className="w-6 px-2 py-1.5">
                        {r.ok ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                        ) : (
                          <XCircle className="h-3.5 w-3.5 text-destructive" />
                        )}
                      </td>
                      <td className="px-2 py-1.5">Row {r.index + 2}</td>
                      <td className="px-2 py-1.5 text-muted-foreground">{r.error ?? "OK"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end gap-2 border-t pt-4">
              {!importing && (
                <Button variant="outline" onClick={reset}>
                  Import another file
                </Button>
              )}
              <Button onClick={close} disabled={importing}>
                Done
              </Button>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}
