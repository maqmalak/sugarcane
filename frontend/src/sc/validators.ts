/** Pakistani CNIC / mobile / IBAN checks for the forms — the same rules the server applies on save
 *  (sugarcane.calc.identity), so mistakes show under the field before the user presses Save. */

const digits = (v: unknown) => String(v ?? "").replace(/[\s\-().+]/g, "");

export function cnicError(v: unknown): string | undefined {
  if (!v) return undefined;
  return /^\d{13}$/.test(digits(v)) ? undefined : "CNIC must be 13 digits, e.g. 33100-8680138-5";
}

export function mobileError(v: unknown): string | undefined {
  if (!v) return undefined;
  let d = digits(v);
  if (!/^\d+$/.test(d)) return "Mobile must contain digits only, e.g. 03007212058";
  if (d.startsWith("0092")) d = `0${d.slice(4)}`;
  else if (d.startsWith("92") && d.length === 12) d = `0${d.slice(2)}`;
  else if (d.startsWith("3") && d.length === 10) d = `0${d}`;
  if (!d.startsWith("03")) return "Mobile must start with 03, e.g. 03007212058";
  if (d.length !== 11) return `Mobile must be exactly 11 digits (you entered ${d.length}), e.g. 03007212058`;
  return undefined;
}

function mod97(text: string): number {
  let r = 0;
  for (const ch of text) {
    const n = parseInt(ch, 36);
    for (const c of String(n)) r = (r * 10 + Number(c)) % 97;
  }
  return r;
}

export function ibanError(v: unknown): string | undefined {
  if (!v) return undefined;
  const iban = String(v).replace(/\s/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{8,30}$/.test(iban)) return "IBAN is not in the right format, e.g. PK36SCBL0000001123456702";
  if (iban.startsWith("PK") && iban.length !== 24) return `A Pakistani IBAN has 24 characters (you entered ${iban.length})`;
  if (mod97(iban.slice(4) + iban.slice(0, 4)) !== 1) return "IBAN check digits do not match — a character is mistyped";
  return undefined;
}

/** { field: message } for the fields that have a problem. */
export function idErrors(values: Record<string, unknown>, fields: { cnic?: string; mobile?: string[]; iban?: string }) {
  const out: Record<string, string> = {};
  const put = (f: string | undefined, e: string | undefined) => { if (f && e) out[f] = e; };
  put(fields.cnic, cnicError(fields.cnic && values[fields.cnic]));
  for (const f of fields.mobile ?? []) put(f, mobileError(values[f]));
  put(fields.iban, ibanError(fields.iban && values[fields.iban]));
  return out;
}
