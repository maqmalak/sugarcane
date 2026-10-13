import { useCallback, useState } from "react";

/**
 * Click-a-summary-card-to-filter state for list/pipeline pages that render their own stat cards.
 * `predicates` maps a card key to "does this row belong to that card" — the SAME function the card's
 * count should be computed with, so the number on a card always matches the rows you get by clicking it.
 * Clicking the active card again releases it.
 */
export function useStatCardFilter<K extends string, T>(predicates: Record<K, (row: T) => boolean>) {
  const [active, setActive] = useState<K | null>(null);

  const toggle = useCallback((key: K) => setActive((cur) => (cur === key ? null : key)), []);
  const clear = useCallback(() => setActive(null), []);

  const matches = useCallback((row: T) => (active ? predicates[active](row) : true), [active, predicates]);
  const apply = useCallback((rows: T[]) => (active ? rows.filter(predicates[active]) : rows), [active, predicates]);

  return { active, toggle, clear, matches, apply };
}
