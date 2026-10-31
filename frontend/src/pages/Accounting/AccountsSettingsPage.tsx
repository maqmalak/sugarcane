import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Sliders } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/common/error-state";
import { FrappeForm } from "@/components/forms/frappe-form";
import { type FormFieldMeta } from "@/components/forms/field-primitives";
import { useAccountsSettings } from "@/hooks/useSettings";
import { humanizeError } from "@/services/frappe";

const FIELDS: FormFieldMeta[] = [
  { fieldname: "sb_general", label: "General", fieldtype: "Section Break" },
  { fieldname: "determine_address_tax_category_from", label: "Determine Address Tax Category From", fieldtype: "Select", options: "Billing Address\nShipping Address" },
  { fieldname: "credit_controller", label: "Credit Controller (Role)", fieldtype: "Link", options: "Role" },
  { fieldname: "default_ageing_range", label: "Default Ageing Range (days)", fieldtype: "Data", placeholder: "e.g. 30, 60, 90, 120" },
  { fieldname: "cb_general_1", fieldtype: "Column Break" },
  { fieldname: "check_supplier_invoice_uniqueness", label: "Check Supplier Invoice Number Uniqueness", fieldtype: "Check" },
  { fieldname: "enable_common_party_accounting", label: "Enable Common Party Accounting", fieldtype: "Check" },
  { fieldname: "enable_accounting_dimensions", label: "Enable Accounting Dimensions", fieldtype: "Check" },
  { fieldname: "enable_discounts_and_margin", label: "Enable Discount Accounting for Selling", fieldtype: "Check" },

  { fieldname: "sb_payments", label: "Payments & Billing", fieldtype: "Section Break" },
  { fieldname: "make_payment_via_journal_entry", label: "Make Payment via Journal Entry", fieldtype: "Check" },
  { fieldname: "unlink_payment_on_cancellation_of_invoice", label: "Unlink Payment on Cancellation of Invoice", fieldtype: "Check" },
  { fieldname: "unlink_advance_payment_on_cancelation_of_order", label: "Unlink Advance Payment on Cancellation of Order", fieldtype: "Check" },
  { fieldname: "automatically_fetch_payment_terms", label: "Automatically Fetch Payment Terms", fieldtype: "Check" },
  { fieldname: "cb_payments_1", fieldtype: "Column Break" },
  { fieldname: "over_billing_allowance", label: "Over Billing Allowance (%)", fieldtype: "Float" },
  { fieldname: "role_allowed_to_over_bill", label: "Role Allowed to Over Bill", fieldtype: "Link", options: "Role" },
  { fieldname: "allow_stale", label: "Allow Stale Exchange Rates", fieldtype: "Check" },
  { fieldname: "stale_days", label: "Stale Days", fieldtype: "Int", description: "Only used when Allow Stale Exchange Rates is off." },

  { fieldname: "sb_print", label: "Print & Ledger", fieldtype: "Section Break" },
  { fieldname: "show_inclusive_tax_in_print", label: "Show Inclusive Tax in Print", fieldtype: "Check" },
  { fieldname: "show_payment_schedule_in_print", label: "Show Payment Schedule in Print", fieldtype: "Check" },
  { fieldname: "cb_print_1", fieldtype: "Column Break" },
  { fieldname: "show_balance_in_coa", label: "Show Balance in Chart of Accounts", fieldtype: "Check" },
  { fieldname: "merge_similar_account_heads", label: "Merge Similar Account Heads", fieldtype: "Check" },
  { fieldname: "general_ledger_remarks_length", label: "General Ledger Remarks Length", fieldtype: "Int" },

  { fieldname: "sb_asset", label: "Assets", fieldtype: "Section Break" },
  { fieldname: "book_asset_depreciation_entry_automatically", label: "Book Asset Depreciation Entry Automatically", fieldtype: "Check" },
  { fieldname: "cb_asset_1", fieldtype: "Column Break" },
  { fieldname: "enable_immutable_ledger", label: "Enable Immutable Ledger", fieldtype: "Check" },
];

/** Accounts Settings — site-wide accounting behavior (credit control, payment terms, GL display, ...). */
export function AccountsSettingsPage() {
  const { data, isLoading, error, mutate, save, saving } = useAccountsSettings();
  const [values, setValues] = useState<Record<string, any>>({});

  useEffect(() => {
    if (data) setValues({ ...data });
  }, [data]);

  const handleSave = async () => {
    try {
      await save(values);
      toast.success("Accounts Settings saved");
    } catch (e) {
      toast.error(humanizeError(e));
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Accounts Settings"
        subtitle="Company-wide accounting policies — rounding, credit limits, stock/GL sync"
        icon={<Sliders className="h-5 w-5" />}
      />
      <Card className="max-w-4xl">
        <CardContent className="space-y-5 pt-5">
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </div>
          ) : error ? (
            <ErrorState error={error} onRetry={() => void mutate()} />
          ) : (
            <>
              <FrappeForm fields={FIELDS} values={values} onChange={(fieldname, value) => setValues((v) => ({ ...v, [fieldname]: value }))} />
              <div className="flex justify-end border-t pt-4">
                <Button onClick={handleSave} loading={saving}>
                  Save Changes
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
