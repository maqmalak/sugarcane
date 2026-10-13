/**
 * Client-side "Print" / "Export to PDF" for tabular data — no PDF library.
 * Renders the rows into a hidden iframe with a print-only stylesheet and
 * invokes the browser's native print dialog, where the user can print to
 * paper or choose "Save as PDF" as the destination.
 */

function escapeHtml(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Writes `html` into a hidden iframe and opens the browser's print dialog for it. */
function openPrintDialog(html: string) {
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.setAttribute("aria-hidden", "true");
  document.body.appendChild(iframe);

  const cleanup = () => {
    if (iframe.parentNode) document.body.removeChild(iframe);
  };

  const doc = iframe.contentWindow?.document;
  if (!doc) {
    cleanup();
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();

  iframe.onload = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } finally {
      // Give the print dialog time to open before the iframe is torn down —
      // some browsers render the print preview from the live iframe content.
      setTimeout(cleanup, 1000);
    }
  };
}

const PAGE_STYLES = `
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; color: #111; margin: 24px; }
  h1 { font-size: 18px; margin: 0 0 2px; }
  .subtitle { font-size: 12px; color: #555; margin: 0 0 16px; }
  table { width: 100%; border-collapse: collapse; font-size: 10px; }
  .meta-row { margin-top: 16px; font-size: 10px; color: #888; }
  @page { size: auto; margin: 14mm; }
`;

function printPage(title: string, subtitle: string | undefined, tableHtml: string, rowCount: number) {
  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>${PAGE_STYLES}</style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  ${subtitle ? `<p class="subtitle">${escapeHtml(subtitle)}</p>` : ""}
  ${tableHtml}
  <p class="meta-row">Printed ${new Date().toLocaleString()} — ${rowCount} record${rowCount === 1 ? "" : "s"}</p>
</body>
</html>`;
  openPrintDialog(html);
}

const DOCUMENT_STYLES = `
  * { box-sizing: border-box; }
  body { font-family: Georgia, "Times New Roman", Times, serif; color: #111; margin: 18px; line-height: 1.35; font-size: 10px; }
  .doc-header { text-align: center; margin-bottom: 12px; }
  h1 { font-size: 14px; margin: 0 0 2px; letter-spacing: 0.02em; text-transform: uppercase; }
  .subtitle { font-size: 9px; color: #555; margin: 0; font-style: italic; }
  .info-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 2px 20px; font-size: 9px; margin-bottom: 12px; padding: 8px 0; border-top: 1px solid #999; border-bottom: 1px solid #999; }
  .info-grid dt { color: #555; display: inline; }
  .info-grid dt::after { content: ": "; }
  .info-grid dd { display: inline; margin: 0; font-weight: 600; }
  .info-grid > div { margin: 0; }
  .body-content { font-size: 9.5px; text-align: justify; }
  .body-content h2 { font-size: 11px; margin: 10px 0 4px; text-align: center; }
  .body-content h3 { font-size: 9.5px; margin: 8px 0 3px; font-weight: 700; }
  .body-content p, .body-content li { margin: 0 0 4px; }
  .body-content ol, .body-content ul { margin: 0 0 4px; padding-left: 18px; }
  .signature-block { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0 32px; margin-top: 28px; font-size: 9px; }
  .signature-line { border-top: 1px solid #111; margin-top: 28px; padding-top: 3px; }
  .meta-row { margin-top: 12px; font-size: 8px; color: #888; text-align: center; }
  @page { size: auto; margin: 10mm; }
`;

/**
 * Print preview for a single formatted document (e.g. a Contract) — a
 * centered letterhead-style header, an info block of key/value pairs,
 * arbitrary trusted HTML body content (e.g. Quill-authored terms), and a
 * signature block. Sized to fit as much as possible on one page. Distinct
 * from `printRows`, which renders a tabular list of many records instead of
 * one document.
 */
export function printDocument(
  title: string,
  subtitle: string | undefined,
  info: { label: string; value: string }[],
  bodyHtml: string,
  signees?: { label: string; name?: string }[],
) {
  const infoHtml = info.length
    ? `<dl class="info-grid">${info.map((i) => `<div><dt>${escapeHtml(i.label)}</dt><dd>${escapeHtml(i.value)}</dd></div>`).join("")}</dl>`
    : "";
  const signatureHtml = (signees ?? [{ label: "Participant" }, { label: "For the Company" }])
    .map((s) => `<div><p class="signature-line">${escapeHtml(s.label)}${s.name ? ` — ${escapeHtml(s.name)}` : ""}</p></div>`)
    .join("");
  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>${DOCUMENT_STYLES}</style>
</head>
<body>
  <div class="doc-header">
    <h1>${escapeHtml(title)}</h1>
    ${subtitle ? `<p class="subtitle">${escapeHtml(subtitle)}</p>` : ""}
  </div>
  ${infoHtml}
  <div class="body-content">${bodyHtml}</div>
  <div class="signature-block">${signatureHtml}</div>
  <p class="meta-row">Printed ${new Date().toLocaleString()}</p>
</body>
</html>`;
  openPrintDialog(html);
}

export interface PrintColumn {
  key: string;
  label: string;
}

/** Open the browser's print dialog for a titled table of rows. */
export function printRows(title: string, columns: PrintColumn[], rows: Record<string, unknown>[], subtitle?: string) {
  const head = columns.map((c) => `<th>${escapeHtml(c.label)}</th>`).join("");
  const body = rows.map((r) => `<tr>${columns.map((c) => `<td>${escapeHtml(r[c.key])}</td>`).join("")}</tr>`).join("");
  const table = `<style>
      th, td { border: 1px solid #ccc; padding: 4px 8px; text-align: left; vertical-align: top; }
      th { background: #f2f2f2; font-weight: 600; }
      tbody tr:nth-child(even) { background: #fafafa; }
    </style>
    <table>
      <thead><tr>${head}</tr></thead>
      <tbody>${body || `<tr><td colspan="${columns.length}">No records</td></tr>`}</tbody>
    </table>`;
  printPage(title, subtitle, table, rows.length);
}

export interface PrintTreeRow {
  depth: number;
  code?: string;
  label: string;
  isGroup?: boolean;
  /** Right-aligned trailing text (e.g. root type, status). */
  meta?: string;
}

/** Open the browser's print dialog for an indented hierarchy (Chart of Accounts, Cost Center, ...). */
export function printTree(title: string, rows: PrintTreeRow[], subtitle?: string) {
  const body = rows
    .map((r) => {
      const code = r.code ? `<span class="code">${escapeHtml(r.code)}</span>` : "";
      return `<tr>
        <td style="padding-left:${8 + r.depth * 14}px" class="${r.isGroup ? "grp" : ""}">${code}${escapeHtml(r.label)}</td>
        <td class="meta">${escapeHtml(r.meta ?? "")}</td>
      </tr>`;
    })
    .join("");
  const table = `<style>
      table { font-size: 9px; }
      td { padding: 1px 6px; border-bottom: 1px solid #eee; vertical-align: baseline; }
      td.grp { font-weight: 700; }
      td.meta { text-align: right; color: #666; white-space: nowrap; }
      .code { display: inline-block; min-width: 34px; font-variant-numeric: tabular-nums; color: #888; margin-right: 5px; }
    </style>
    <table>
      <tbody>${body || `<tr><td>No records</td></tr>`}</tbody>
    </table>`;
  printPage(title, subtitle, table, rows.length);
}
