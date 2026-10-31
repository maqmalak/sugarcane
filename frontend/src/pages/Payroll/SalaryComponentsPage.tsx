import { Coins } from "lucide-react";
import { MastersPage } from "@/components/crm/MastersPage";
import { StatusBadge } from "@/components/common/status-badge";

interface SalaryComponentRow {
  name: string;
  salary_component?: string;
  salary_component_abbr?: string;
  type?: string;
  description?: string;
  disabled?: number;
}

export default function SalaryComponentsPage() {
  return (
    <MastersPage<SalaryComponentRow>
      config={{
        title: "Salary Components",
        subtitle: "Earning and deduction types used to build salary structures and slips",
        icon: <Coins className="h-5 w-5" />,
        doctype: "Salary Component",
        fields: ["name", "salary_component", "salary_component_abbr", "type", "description", "disabled"],
        formFields: [
          { fieldname: "salary_component", label: "Component Name", fieldtype: "Data", reqd: true },
          { fieldname: "type", label: "Type", fieldtype: "Select", options: "Earning\nDeduction", reqd: true },
          { fieldname: "salary_component_abbr", label: "Abbreviation", fieldtype: "Data" },
          { fieldname: "description", label: "Description", fieldtype: "Text" },
          { fieldname: "disabled", label: "Disabled", fieldtype: "Check" },
        ],
        primaryField: "salary_component",
        primaryLabel: "Component",
        secondaryFields: [{ field: "salary_component_abbr", label: "Abbr" }],
        renderBadge: (r) => <StatusBadge status={r.type} />,
      }}
    />
  );
}
