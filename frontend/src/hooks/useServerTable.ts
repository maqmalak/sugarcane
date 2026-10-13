import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { postCall } from "@/services/frappe";
import type { ServerTableControls } from "@/components/tables/data-table";

type Sort = { key: string; dir: "asc" | "desc" };

/**
 * State for a list that pages, searches and sorts ON THE SERVER — for doctypes with far more
 * rows than can be loaded into the browser (Payment Entry, Journal Entry, GL, …).
 *
 * The old pattern (`limit: 200` + the table's in-browser search) silently showed only the 200
 * newest rows and could never find anything older: a search for a document outside those 200
 * matched nothing. Here the search runs as a database `like` over `searchFields`, the page is a
 * `limit_start`/`limit` window, and `total` comes from a real count.
 *
 *   const table = useServerTable({ searchFields: ["name", "party"], sort: { key: "posting_date", dir: "desc" } });
 *   const { data } = useThing({ orFilters: table.orFilters, limit: table.pageSize, limitStart: table.limitStart, orderBy: table.orderBy });
 *   const { data: total } = useServerDocCount("Thing", filters, table.orFilters);
 *   <FrappeDataTable rows={data ?? []} serverSide={table.controls(total ?? 0)} … />
 */
export function useServerTable(opts: {
  /** DB fields the search box is matched against (`like %text%`, OR-ed). */
  searchFields: string[];
  pageSize?: number;
  sort?: Sort;
  debounceMs?: number;
}) {
  const { searchFields, pageSize: initialPageSize = 50, sort: initialSort = { key: "creation", dir: "desc" }, debounceMs = 300 } = opts;
  const [page, setPage] = useState(0);
  const [pageSize, setPageSizeState] = useState(initialPageSize);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [sort, setSort] = useState<Sort>(initialSort);

  // Wait for the user to stop typing before hitting the server, and go back to page 1 for a new search.
  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(query.trim());
      setPage(0);
    }, debounceMs);
    return () => clearTimeout(t);
  }, [query, debounceMs]);

  const fieldsKey = searchFields.join("|");
  const orFilters = useMemo<unknown[][]>(
    () => (debounced ? fieldsKey.split("|").map((f) => [f, "like", `%${debounced}%`]) : []),
    [debounced, fieldsKey],
  );

  // `name` is the tie-breaker: many rows can share one posting date, and without a unique last key
  // MariaDB may return overlapping/missing rows between pages.
  const orderBy = useMemo(
    () => ({ field: `${sort.key} ${sort.dir}, name`, order: sort.dir }),
    [sort.key, sort.dir],
  );

  const controls = (total: number): ServerTableControls => ({
    total,
    page,
    pageSize,
    onPageChange: setPage,
    onPageSizeChange: (n) => {
      setPageSizeState(n);
      setPage(0);
    },
    query,
    onQueryChange: setQuery,
    sort,
    onSortChange: setSort,
  });

  return { page, pageSize, limitStart: page * pageSize, orFilters, orderBy, sort, controls };
}

/** Exact number of rows matching `filters` AND (any of) `orFilters` — Frappe's own list-view count endpoint. */
export function useServerDocCount(doctype: string, filters: unknown[][] = [], orFilters: unknown[][] = [], enabled = true) {
  const f = JSON.stringify(filters);
  const o = JSON.stringify(orFilters);
  return useSWR<number>(
    enabled ? ["micromax.count", doctype, f, o] : null,
    () =>
      postCall<number>("frappe.desk.reportview.get_count", {
        doctype,
        filters: f,
        or_filters: o,
      }),
    { keepPreviousData: true, revalidateOnFocus: false },
  );
}
