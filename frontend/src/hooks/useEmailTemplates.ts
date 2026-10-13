import { useFrappeGetDocList } from "frappe-react-sdk";

export interface EmailTemplateRow {
  name: string;
  subject: string;
  response?: string;
}

/**
 * Core `Email Template` doctype (frappe.email.doctype.email_template) —
 * shared across the whole desk (HR/Payroll notification templates live in
 * the same table), so this is scoped to `crm_template = 1` — a custom field
 * marking a template as belonging to the CRM's own Email Templates list
 * (src/pages/CRM/EmailTemplatesPage.tsx) — to keep this compose-box picker
 * from mixing in unrelated HR/Payroll templates.
 */
export function useEmailTemplates() {
  const { data, isLoading, error, mutate } = useFrappeGetDocList<EmailTemplateRow>(
    "Email Template",
    {
      fields: ["name", "subject", "response"],
      filters: [["crm_template", "=", 1]],
      orderBy: { field: "name", order: "asc" },
      limit: 0,
    },
    "micromax.email-templates",
  );
  return { templates: data ?? [], isLoading, error, mutate };
}
