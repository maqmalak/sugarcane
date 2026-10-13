import { useFrappeGetDocList } from "frappe-react-sdk";
import type { GLEntry } from "@/types/frappe";

const GL_ENTRY_FIELDS = [
  "name",
  "posting_date",
  "account",
  "party_type",
  "party",
  "debit",
  "credit",
  "against",
  "against_voucher_type",
  "against_voucher",
  "voucher_type",
  "voucher_no",
  "remarks",
] as const;

/**
 * General Ledger entries posted against a single voucher (e.g. a Purchase
 * Invoice or Purchase Receipt). GL Entry is a normal, independently listable
 * DocType — unlike the Purchase Order/Receipt/Invoice Item link lookups, this
 * needs no server-side helper.
 */
export function useGLEntries(args: { voucherType?: string; voucherNo?: string; enabled?: boolean }) {
  const { voucherType, voucherNo, enabled = true } = args;
  const ready = enabled && Boolean(voucherType) && Boolean(voucherNo);
  return useFrappeGetDocList<GLEntry>(
    "GL Entry",
    {
      fields: GL_ENTRY_FIELDS as unknown as (keyof GLEntry)[],
      filters: (ready
        ? [
            ["voucher_type", "=", voucherType],
            ["voucher_no", "=", voucherNo],
            ["is_cancelled", "=", 0],
          ]
        : [["name", "=", ""]]) as any,
      limit: 200,
      orderBy: { field: "creation", order: "asc" },
    },
    ready ? `micromax.gl.${voucherType}.${voucherNo}` : null,
  );
}
