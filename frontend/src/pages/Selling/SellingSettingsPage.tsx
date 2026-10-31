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
import { useSellingSettings } from "@/hooks/useSettings";
import { humanizeError } from "@/services/frappe";

const FIELDS: FormFieldMeta[] = [
  { fieldname: "sb_naming", label: "Customers", fieldtype: "Section Break" },
  { fieldname: "cust_master_name", label: "Customer Naming By", fieldtype: "Select", options: "Customer Name\nNaming Series\nAuto Name" },
  { fieldname: "customer_group", label: "Default Customer Group", fieldtype: "Link", options: "Customer Group" },
  { fieldname: "cb_naming_1", fieldtype: "Column Break" },
  { fieldname: "territory", label: "Default Territory", fieldtype: "Link", options: "Territory" },
  { fieldname: "selling_price_list", label: "Default Price List", fieldtype: "Link", options: "Price List" },

  { fieldname: "sb_requirements", label: "Transaction Requirements", fieldtype: "Section Break" },
  { fieldname: "so_required", label: "Sales Order Required for Sales Invoice", fieldtype: "Select", options: "No\nYes" },
  { fieldname: "dn_required", label: "Delivery Note Required for Sales Invoice", fieldtype: "Select", options: "No\nYes" },
  { fieldname: "cb_requirements_1", fieldtype: "Column Break" },
  { fieldname: "allow_multiple_items", label: "Allow Multiple Items to Be Selected Together", fieldtype: "Check" },
  { fieldname: "validate_selling_price", label: "Validate Selling Price Against Purchase Rate", fieldtype: "Check" },

  { fieldname: "sb_pricing", label: "Pricing", fieldtype: "Section Break" },
  { fieldname: "maintain_same_sales_rate", label: "Maintain Same Rate Throughout the Sales Cycle", fieldtype: "Check" },
  { fieldname: "editable_price_list_rate", label: "Allow Editing Price List Rate from Transactions", fieldtype: "Check" },
  { fieldname: "cb_pricing_1", fieldtype: "Column Break" },
  { fieldname: "allow_negative_rates_for_items", label: "Allow Negative Rates for Items", fieldtype: "Check" },
  { fieldname: "enable_discount_accounting", label: "Enable Discount Accounting", fieldtype: "Check" },
  { fieldname: "hide_tax_id", label: "Hide Customer's Tax ID from Sales Transactions", fieldtype: "Check" },
];

/** Selling Settings — customer naming, defaults, and quotation/order transaction rules. */
export function SellingSettingsPage() {
  const { data, isLoading, error, mutate, save, saving } = useSellingSettings();
  const [values, setValues] = useState<Record<string, any>>({});

  useEffect(() => {
    if (data) setValues({ ...data });
  }, [data]);

  const handleSave = async () => {
    try {
      await save(values);
      toast.success("Selling Settings saved");
    } catch (e) {
      toast.error(humanizeError(e));
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Selling Settings" subtitle="Customer defaults and sales transaction rules" icon={<Sliders className="h-5 w-5" />} />
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
