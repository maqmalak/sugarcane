import { useMemo } from "react";
import { Navigate, useParams } from "react-router-dom";
import useSWR from "swr";
import { EmptyState } from "@/components/common/empty-state";
import { DocFormPage } from "@/components/doc/doc-form-page";
import { DocListPage } from "@/components/doc/doc-list-page";
import { getCall } from "@/services/frappe";
import { bySlug, docBase, ENHANCERS } from "../registry";
import { buildConfig, type FormMeta } from "./buildConfig";

/** /<app>/d/:slug (list) and /<app>/d/:slug/:name (form) for every registered sugar-mill DocType. */
export function MetaDocPage({ mode }: { mode: "list" | "form" }) {
  const { slug = "" } = useParams();
  const entry = bySlug(slug);
  const { data: meta, error } = useSWR(entry ? ["sc-form-meta", entry.doctype] : null, () =>
    getCall<FormMeta>("sugarcane.api.v1.spa.form_meta", { doctype: entry!.doctype }), { revalidateOnFocus: false });
  const config = useMemo(
    () => (meta && entry ? buildConfig(meta, docBase(entry.doctype), { icon: entry.icon, ...ENHANCERS[entry.doctype] }) : undefined),
    [meta, entry],
  );
  if (!entry) return <Navigate to="/home" replace />;
  if (error) return <div className="p-6"><EmptyState title="Could not load this form" description={String((error as Error).message ?? error)} /></div>;
  if (!config) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  if (config.single || mode === "form") return <DocFormPage config={config} />;
  return <DocListPage config={config} />;
}
