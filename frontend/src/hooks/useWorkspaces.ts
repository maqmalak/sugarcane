import { useMemo } from "react";
import { useFrappeGetDocList } from "frappe-react-sdk";

interface WorkspaceRow {
  name: string;
  module: string;
}

/**
 * Real, live set of ERPNext module names that currently have at least one
 * visible Workspace (`is_hidden=0`, `public=1`) on this site — i.e. modules
 * an admin has actually enabled/exposed in the app launcher, not just
 * installed. Used to gate Desktop tiles dynamically instead of assuming
 * every module this app knows about is present on every deployment.
 */
export function useVisibleModules(enabled = true) {
  const { data, isLoading, error } = useFrappeGetDocList<WorkspaceRow>(
    "Workspace",
    {
      fields: ["name", "module"],
      filters: [
        ["is_hidden", "=", 0],
        ["public", "=", 1],
      ] as any,
      limit: 0,
    },
    enabled ? "micromax.workspaces.visible" : null,
  );

  const modules = useMemo(() => new Set((data ?? []).map((w) => w.module).filter(Boolean)), [data]);

  return { modules, isLoading, error };
}

interface DocTypeRow {
  name: string;
  module: string;
}

/**
 * Real doctype names per ERPNext module, one query shared across every app
 * card (not N+1 per card) — used as the "features" list shown under each
 * card's title, so it reflects what this ERPNext site actually has rather
 * than hand-written marketing copy. Excludes child-table and single
 * doctypes, which aren't things a user would recognize as a feature.
 */
export function useModuleDocTypes(modules: string[]) {
  const key = [...modules].sort().join(",");
  const { data, isLoading } = useFrappeGetDocList<DocTypeRow>(
    "DocType",
    {
      fields: ["name", "module"],
      filters: [
        ["module", "in", modules],
        ["istable", "=", 0],
        ["issingle", "=", 0],
      ] as any,
      orderBy: { field: "name", order: "asc" },
      limit: 0,
    },
    modules.length > 0 ? `micromax.doctypes-by-module.${key}` : null,
  );

  const byModule = useMemo(() => {
    const map = new Map<string, string[]>();
    (data ?? []).forEach((d) => {
      const list = map.get(d.module) ?? [];
      list.push(d.name);
      map.set(d.module, list);
    });
    return map;
  }, [data]);

  return { byModule, isLoading };
}
