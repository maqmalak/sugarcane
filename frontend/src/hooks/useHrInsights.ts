import { useEffect, useState } from "react";
import useSWR from "swr";
import { getCall } from "@/services/frappe";

/** `value`, but only after it has stopped changing for `ms` (for search boxes that hit the server). */
export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** GET a `micromax.hr_insights.*` method; empty params are dropped, the previous result stays shown while the next loads. */
export function useHrInsights<T>(method: string, params: Record<string, unknown>, enabled = true) {
  const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ""));
  return useSWR<T>(
    enabled ? [`micromax.hr_insights.${method}`, JSON.stringify(clean)] : null,
    () => getCall<T>(`micromax.hr_insights.${method}`, clean),
    { keepPreviousData: true, revalidateOnFocus: false },
  );
}
