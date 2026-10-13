import { useCallback, useRef, type Dispatch, type SetStateAction } from "react";
import { getCall } from "@/services/frappe";

/** CRM Organization field → the form field it fills. */
export type OrganizationFieldMap = Record<string, string>;

/**
 * Lead form. `annual_revenue` is deliberately absent: on a Lead it's repurposed as "Expected Amount"
 * (the expected donation), not the company's revenue, so copying the Organization's figure into it
 * would put a wrong number there. `address` is the Lead's own free-text custom field.
 */
export const LEAD_ORGANIZATION_FIELDS: OrganizationFieldMap = {
  website: "website",
  no_of_employees: "no_of_employees",
  industry: "industry",
  territory: "territory",
  address: "address",
};

/** Deal form — a Deal's annual_revenue really is the organization's, and it has no address field. */
export const DEAL_ORGANIZATION_FIELDS: OrganizationFieldMap = {
  website: "website",
  no_of_employees: "no_of_employees",
  industry: "industry",
  territory: "territory",
  annual_revenue: "annual_revenue",
};

const isBlank = (v: unknown) => v === null || v === undefined || v === "";

/**
 * Frappe-style "fetch from": returns a function to call with the newly picked Organization's name; it
 * loads that CRM Organization and copies the mapped fields into the form.
 *
 * - An Organization value overwrites what's in the form (that's the point of picking one).
 * - A field the Organization has NO value for is left alone, so anything the user typed isn't wiped —
 *   except a value THIS hook filled in from the previous Organization: switching A → B where B lacks
 *   e.g. a website clears A's website instead of leaving it attached to B.
 * - Only runs on a user's pick, never when an existing record loads, so it can't overwrite saved data.
 */
export function useOrganizationAutofill<T extends Record<string, any>>(
  map: OrganizationFieldMap,
  setValues: Dispatch<SetStateAction<T>>,
) {
  // form field -> value this hook last wrote into it
  const filled = useRef<Record<string, string>>({});
  // Only the latest pick may apply, even if an earlier request answers last.
  const latest = useRef(0);

  return useCallback(
    async (organization: string) => {
      const ticket = ++latest.current;
      const orgName = organization.trim();
      if (!orgName) return;

      let org: Record<string, unknown> | null | undefined;
      try {
        org = await getCall<Record<string, unknown> | null>("frappe.client.get_value", {
          doctype: "CRM Organization",
          filters: JSON.stringify({ name: orgName }),
          fieldname: JSON.stringify(Object.keys(map)),
        });
      } catch {
        // e.g. a name typed in that isn't an existing Organization — nothing to fetch (the server
        // still validates the link on save).
        return;
      }
      if (!org || ticket !== latest.current) return;
      const fetched = org;

      setValues((prev) => {
        const next: Record<string, any> = { ...prev };
        for (const [orgField, formField] of Object.entries(map)) {
          const value = fetched[orgField];
          if (!isBlank(value)) {
            next[formField] = value;
            filled.current[formField] = String(value);
          } else if (formField in filled.current && String(prev[formField] ?? "") === filled.current[formField]) {
            next[formField] = "";
            delete filled.current[formField];
          }
        }
        return next as T;
      });
    },
    [map, setValues],
  );
}
