import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "micromax.crm.monthly-lead-target";
const DEFAULT_TARGET = 50;

/**
 * The monthly lead-generation target shown against "Achieved" on the Leads
 * page. There's no backend concept for this anywhere in the CRM app or
 * ERPNext, and a single org-wide number doesn't need a real DocType/table —
 * it's just remembered per-browser via localStorage, editable inline.
 */
export function useMonthlyLeadTarget() {
  const [target, setTargetState] = useState<number>(DEFAULT_TARGET);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = Number(raw);
        if (Number.isFinite(parsed) && parsed > 0) setTargetState(parsed);
      }
    } catch {
      /* localStorage unavailable (private mode, blocked) — keep the default */
    }
  }, []);

  const setTarget = useCallback((value: number) => {
    const safe = Math.max(1, Math.round(value));
    setTargetState(safe);
    try {
      window.localStorage.setItem(STORAGE_KEY, String(safe));
    } catch {
      /* best-effort persistence only */
    }
  }, []);

  return { target, setTarget };
}
