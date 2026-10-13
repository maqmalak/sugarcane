/**
 * `wa.me` click-to-chat/call links (WhatsApp's own public deep-link scheme —
 * no API key, no app install requirement on the recipient's side). WhatsApp
 * requires the number as plain digits with the country code and no leading
 * "+", "00", spaces, dashes, or parens, so every phone value stored in the
 * CRM (mixed formats: "+92 300 7212058", "0300-7212058", "(042) 111-673-853")
 * needs normalizing before it's usable here.
 */

/** Strip everything but digits, and drop a leading "00" international prefix. */
function digitsOnly(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.startsWith("00") ? digits.slice(2) : digits;
}

/**
 * Build a `wa.me` link for a phone number, or `null` if it doesn't look
 * like a real number (too short once formatting is stripped).
 *
 * Numbers without a country code are assumed local to `defaultCountryCode`
 * (Pakistan, "92", to match this deployment's donor data) — a leading
 * trunk "0" (the domestic dialing prefix, e.g. "0300...") is dropped first
 * so it doesn't get counted as part of the number.
 */
export function whatsappUrl(phone?: string | null, defaultCountryCode = "92"): string | null {
  if (!phone) return null;
  let digits = digitsOnly(phone);
  if (digits.length < 7) return null;

  if (!digits.startsWith(defaultCountryCode)) {
    if (digits.startsWith("0")) digits = digits.slice(1);
    digits = defaultCountryCode + digits;
  }
  return `https://wa.me/${digits}`;
}
