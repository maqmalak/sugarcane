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
import { useBuyingSettings } from "@/hooks/useSettings";
import { humanizeError } from "@/services/frappe";

const FIELDS: FormFieldMeta[] = [
  { fieldname: "sb_naming", label: "Suppliers", fieldtype: "Section Break" },
  { fieldname: "supp_master_name", label: "Supplier Naming By", fieldtype: "Select", options: "Supplier Name\nNaming Series\nAuto Name" },
  { fieldname: "supplier_group", label: "Default Supplier Group", fieldtype: "Link", options: "Supplier Group" },
  { fieldname: "cb_naming_1", fieldtype: "Column Break" },
  { fieldname: "buying_price_list", label: "Default Price List", fieldtype: "Link", options: "Price List" },

  { fieldname: "sb_requirements", label: "Transaction Requirements", fieldtype: "Section Break" },
  { fieldname: "po_required", label: "Purchase Order Required for Purchase Invoice", fieldtype: "Select", options: "No\nYes" },
  { fieldname: "pr_required", label: "Purchase Receipt Required for Purchase Invoice", fieldtype: "Select", options: "No\nYes" },
  { fieldname: "cb_requirements_1", fieldtype: "Column Break" },
  { fieldname: "allow_multiple_items", label: "Allow Multiple Items to Be Selected Together", fieldtype: "Check" },
  { fieldname: "bill_for_rejected_quantity_in_purchase_invoice", label: "Bill for Rejected Quantity in Purchase Invoice", fieldtype: "Check" },

  { fieldname: "sb_pricing", label: "Pricing & Allowances", fieldtype: "Section Break" },
  { fieldname: "maintain_same_rate", label: "Maintain Same Rate Throughout the Purchase Cycle", fieldtype: "Check" },
  { fieldname: "disable_last_purchase_rate", label: "Disable Last Purchase Rate on Transactions", fieldtype: "Check" },
  { fieldname: "allow_negative_rates_for_items", label: "Allow Negative Rates for Items", fieldtype: "Check" },
  { fieldname: "cb_pricing_1", fieldtype: "Column Break" },
  { fieldname: "over_transfer_allowance", label: "Over Transfer Allowance (%)", fieldtype: "Float" },
  { fieldname: "blanket_order_allowance", label: "Blanket Order Allowance (%)", fieldtype: "Float" },
];

/** Buying Settings — supplier naming, defaults, and purchase transaction rules. */
export function BuyingSettingsPage() {
  const { data, isLoading, error, mutate, save, saving } = useBuyingSettings();
  const [values, setValues] = useState<Record<string, any>>({});

  useEffect(() => {
    if (data) setValues({ ...data });
  }, [data]);

  const handleSave = async () => {
    try {
      await save(values);
      toast.success("Buying Settings saved");
    } catch (e) {
      toast.error(humanizeError(e));
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Buying Settings" subtitle="Supplier defaults and purchase transaction rules" icon={<Sliders className="h-5 w-5" />} />
      <Card className="max-w-3xl">
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
