import { CalendarDays } from "lucide-react";
import { MastersPage } from "@/components/crm/MastersPage";

interface HolidayListRow {
  name: string;
  holiday_list_name?: string;
  from_date?: string;
  to_date?: string;
  total_holidays?: number;
}

export default function HolidayListsPage() {
  return (
    <MastersPage<HolidayListRow>
      config={{
        title: "Holiday Lists",
        subtitle: "Company holiday calendars used by attendance and shifts",
        icon: <CalendarDays className="h-5 w-5" />,
        doctype: "Holiday List",
        fields: ["name", "holiday_list_name", "from_date", "to_date", "total_holidays"],
        formFields: [
          { fieldname: "holiday_list_name", label: "Holiday List Name", fieldtype: "Data", reqd: true },
          { fieldname: "from_date", label: "From Date", fieldtype: "Date", reqd: true },
          { fieldname: "to_date", label: "To Date", fieldtype: "Date", reqd: true },
        ],
        primaryField: "holiday_list_name",
        primaryLabel: "Holiday List",
        secondaryFields: [
          { field: "from_date", label: "From" },
          { field: "to_date", label: "To" },
          { field: "total_holidays", label: "Holidays" },
        ],
      }}
    />
  );
}
