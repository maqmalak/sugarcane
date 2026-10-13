const nf = new Intl.NumberFormat("en-PK");

export const fmtInt = (n?: number | null) => (n === null || n === undefined ? "—" : nf.format(Math.round(n)));

export function fmtMoney(n?: number | null, currency = "PKR") {
  if (n === null || n === undefined) return "—";
  return new Intl.NumberFormat("en-PK", { style: "currency", currency, maximumFractionDigits: 2 }).format(n);
}

/** Weight in kg shown with its maund equivalent, e.g. "14,162 kg · 354.050 md". */
export function fmtKgMaund(kg?: number | null, maundKg = 40) {
  if (kg === null || kg === undefined) return "—";
  return `${nf.format(kg)} kg · ${(kg / maundKg).toFixed(3)} md`;
}

export function fmtDate(value?: string | null) {
  if (!value) return "—";
  const d = new Date(`${value}T00:00:00`);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
