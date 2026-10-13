import { useFrappeGetDoc, useFrappeUpdateDoc, useFrappeDeleteDoc } from "frappe-react-sdk";

/** Single Employee fetch — every field on the doc, for the tabbed detail/edit page. */
export function useEmployee(name?: string) {
  return useFrappeGetDoc<Record<string, any>>(
    "Employee",
    name ?? undefined,
    name ? `micromax.hr.employee.${name}` : null,
  );
}

export function useEmployeeMutations() {
  const update = useFrappeUpdateDoc<Record<string, any>>();
  const del = useFrappeDeleteDoc();
  return {
    updateDoc: (name: string, values: Record<string, any>) => update.updateDoc("Employee", name, values),
    deleteDoc: (name: string) => del.deleteDoc("Employee", name),
    saving: update.loading,
    deleting: del.loading,
  };
}
