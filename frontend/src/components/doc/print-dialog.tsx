import { useEffect, useState } from "react";
import useSWR from "swr";
import { Download, ExternalLink, Printer } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { getCall, humanizeError } from "@/services/frappe";

interface PrintOptions {
  formats: string[];
  custom: string[];
  default_format: string;
  letter_heads: string[];
  default_letter_head: string | null;
}

const NO_LH = "__none__";
const KEY = (doctype: string) => `print-prefs:${doctype}`;

function loadPrefs(doctype: string): { format?: string; letterHead?: string } {
  try {
    return JSON.parse(localStorage.getItem(KEY(doctype)) ?? "{}");
  } catch {
    return {};
  }
}
function savePrefs(doctype: string, prefs: { format: string; letterHead: string }) {
  try {
    localStorage.setItem(KEY(doctype), JSON.stringify(prefs));
  } catch {
    /* private window — the choice just isn't remembered */
  }
}

/** Query string for Frappe's /printview and download_pdf. */
function printQuery(doctype: string, name: string, format: string, letterHead: string) {
  const q = new URLSearchParams({ doctype, name, format });
  if (letterHead === NO_LH) q.set("no_letterhead", "1");
  else {
    q.set("no_letterhead", "0");
    if (letterHead) q.set("letterhead", letterHead);
  }
  return q.toString();
}

/**
 * Print with the site's Frappe print formats (the ones designed in the desk's Print Format builder / Jinja),
 * with a live preview. Remembers the last format and letter head per doctype in this browser.
 */
export function PrintDialog({ doctype, name, open, onClose }: { doctype: string; name: string; open: boolean; onClose: () => void }) {
  const { data, error } = useSWR<PrintOptions>(open ? ["print-options", doctype] : null, () =>
    getCall<PrintOptions>("mm_core.api.get_print_options", { doctype }),
  );
  const [format, setFormat] = useState("");
  const [letterHead, setLetterHead] = useState("");

  useEffect(() => {
    if (!data) return;
    const prefs = loadPrefs(doctype);
    setFormat(prefs.format && data.formats.includes(prefs.format) ? prefs.format : data.default_format);
    setLetterHead(
      prefs.letterHead && (prefs.letterHead === NO_LH || data.letter_heads.includes(prefs.letterHead))
        ? prefs.letterHead
        : data.default_letter_head ?? NO_LH,
    );
  }, [data, doctype]);

  const ready = Boolean(format);
  const query = ready ? printQuery(doctype, name, format, letterHead) : "";
  const remember = () => savePrefs(doctype, { format, letterHead });

  return (
    <Dialog open={open} onClose={onClose} title={`Print ${name}`} description="Uses the print formats designed in ERPNext." size="xl">
      {error ? (
        <p className="text-sm text-destructive">{humanizeError(error)}</p>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex min-w-56 flex-1 flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">Print format</label>
              <Select value={format} onChange={(e) => setFormat(e.target.value)} disabled={!data} className="h-9 text-sm">
                {data?.custom.length ? (
                  <optgroup label="Designed for this company">
                    {data.custom.map((f) => <option key={f} value={f}>{f}</option>)}
                  </optgroup>
                ) : null}
                <optgroup label="ERPNext standard">
                  {data?.formats.filter((f) => !data.custom.includes(f)).map((f) => <option key={f} value={f}>{f}</option>)}
                </optgroup>
              </Select>
            </div>
            <div className="flex min-w-48 flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">Letter head</label>
              <Select value={letterHead} onChange={(e) => setLetterHead(e.target.value)} disabled={!data} className="h-9 text-sm">
                <option value={NO_LH}>No letter head</option>
                {data?.letter_heads.map((l) => <option key={l} value={l}>{l}</option>)}
              </Select>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={!ready} onClick={() => { remember(); window.open(`/printview?${query}`, "_blank"); }} title="Open in a new tab">
                <ExternalLink className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" disabled={!ready} onClick={() => { remember(); window.open(`/api/method/frappe.utils.print_format.download_pdf?${query}`, "_blank"); }}>
                <Download className="h-4 w-4" /> PDF
              </Button>
              <Button size="sm" disabled={!ready} onClick={() => { remember(); window.open(`/printview?${query}&trigger_print=1`, "_blank"); }}>
                <Printer className="h-4 w-4" /> Print
              </Button>
            </div>
          </div>
          <div className="h-[65vh] overflow-hidden rounded-lg border border-border bg-white">
            {ready ? (
              <iframe key={query} title="Print preview" src={`/printview?${query}`} className="h-full w-full" />
            ) : (
              <p className="p-4 text-sm text-muted-foreground">Loading print formats…</p>
            )}
          </div>
        </div>
      )}
    </Dialog>
  );
}
