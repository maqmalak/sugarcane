import { DocFormPage } from "@/components/doc/doc-form-page";
import { DocListPage } from "@/components/doc/doc-list-page";
import { BANK_ACCOUNT_CONFIG, BANK_CONFIG, CHEQUE_BOOK_CONFIG, PLAID_SETTINGS_CONFIG } from "./banking-configs";

const CONFIGS = { bank: BANK_CONFIG, bankAccount: BANK_ACCOUNT_CONFIG, chequeBook: CHEQUE_BOOK_CONFIG, plaid: PLAID_SETTINGS_CONFIG };

/** Banking list / form pages (one lazy chunk). */
export default function BankingDocPage({ which, form }: { which: keyof typeof CONFIGS; form?: boolean }) {
  const config = CONFIGS[which];
  return form || config.single ? <DocFormPage config={config} /> : <DocListPage config={config} />;
}
