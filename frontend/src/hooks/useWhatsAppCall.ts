import { useFrappeCreateDoc } from "frappe-react-sdk";
import toast from "react-hot-toast";
import { useAuth } from "@/hooks/useAuth";
import { notifyDataChanged } from "@/hooks/useRealtime";
import { whatsappUrl } from "@/utils/whatsapp";
import { nowERPDateTime } from "@/utils/dates";
import type { CrmCallLog } from "@/types/frappe";

/**
 * "Dial" a lead/deal's number via WhatsApp and record it as a `CRM Call Log`
 * in the same click — there's no telephony integration here (`Manual`
 * medium), so this only knows that the dial was *initiated*, not whether a
 * call actually happened; status stays "Initiated" rather than overclaiming
 * "Completed".
 */
export function useWhatsAppCall() {
  const { currentUser } = useAuth();
  const { createDoc } = useFrappeCreateDoc<CrmCallLog>();

  const call = async (phone: string | null | undefined, referenceDoctype: string, referenceDocname?: string) => {
    const url = whatsappUrl(phone);
    if (!url || !phone) return;
    window.open(url, "_blank", "noopener,noreferrer");
    try {
      await createDoc("CRM Call Log", {
        type: "Outgoing",
        status: "Initiated",
        telephony_medium: "Manual",
        // `from` is a mandatory, phone-format-validated field (Frappe's
        // validate_phone_number rejects anything that isn't phone-shaped,
        // e.g. "Administrator" -> InvalidPhoneNumberError, confirmed live
        // against production) — there's no "our own number" tracked
        // anywhere in this app to put here legitimately, so this reuses
        // the number being called rather than fabricating one.
        from: phone,
        to: phone,
        caller: currentUser ?? undefined,
        start_time: nowERPDateTime(),
        reference_doctype: referenceDoctype,
        reference_docname: referenceDocname,
      } as Partial<CrmCallLog>);
      notifyDataChanged();
    } catch {
      // The WhatsApp tab already opened — a failed log entry shouldn't look
      // like the call itself failed, so this stays a quiet toast, not an error.
      toast("Call opened, but couldn't save the call log", { icon: "⚠️" });
    }
  };

  return { call };
}
