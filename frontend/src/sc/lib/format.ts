const pkr = new Intl.NumberFormat("en-PK", { maximumFractionDigits: 0 });

export function money(value: number | null | undefined, opts: { compact?: boolean } = {}): string {
  const v = value ?? 0;
  if (opts.compact) {
    if (Math.abs(v) >= 1e7) return `Rs ${(v / 1e7).toFixed(2)} Cr`;
    if (Math.abs(v) >= 1e5) return `Rs ${(v / 1e5).toFixed(1)} Lac`;
  }
  return `Rs ${pkr.format(v)}`;
}

export function num(value: number | null | undefined): string {
  return pkr.format(value ?? 0);
}

export function date(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value.replace(" ", "T"));
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function dateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value.replace(" ", "T"));
  return d.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function time(value: string | null | undefined): string {
  if (!value) return "";
  return new Date(value.replace(" ", "T")).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

/** 03001234567 / +92 300 1234567 -> 923001234567 (wa.me format) */
export function waNumber(phone: string | null | undefined): string {
  const d = (phone ?? "").replace(/\D/g, "");
  return d.startsWith("0") ? `92${d.slice(1)}` : d;
}

export function marla(value: number | null | undefined): string {
  const v = value ?? 0;
  return v >= 20 && v % 20 === 0 ? `${v / 20} Kanal` : `${v} Marla`;
}

export function metres(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`;
}

/** Today as YYYY-MM-DD in the user's local time zone (toISOString() is UTC, a day behind in Pakistan after midnight). */
export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Area in all three local units: "10 Marla · 2,723 sq ft" (adds Kanal from 1 Kanal up). 1 Marla = 272.25 sq ft. */
export function area(marlaValue: number | null | undefined): string {
  const m = Number(marlaValue ?? 0);
  if (!m) return "—";
  const sqft = Math.round(m * 272.25).toLocaleString("en-PK");
  const kanal = m >= 20 ? ` · ${(m / 20).toFixed(m % 20 ? 2 : 0)} Kanal` : "";
  return `${Number.isInteger(m) ? m : m.toFixed(2)} Marla${kanal} · ${sqft} sq ft`;
}
