import { DocFormPage } from "@/components/doc/doc-form-page";
import { JOURNAL_ENTRY_CONFIG } from "./journal-entry-config";

/** Journal Entry — tabbed form with at-a-glance totals, templates, a GL tab and connections (journal-entry-config.tsx). */
export function JournalEntryFormPage() {
  return <DocFormPage config={JOURNAL_ENTRY_CONFIG} />;
}
