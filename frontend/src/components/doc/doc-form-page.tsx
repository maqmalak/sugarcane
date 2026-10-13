import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import { ArrowLeft, Ban, ChevronDown, CircleDot, History, Copy, ExternalLink, Link as LinkIcon, Link2, PlusCircle, Printer, RefreshCw, Save, Send, Trash2, X, Zap } from "lucide-react";
import { DropdownMenu, type DropdownItem } from "@/components/ui/dropdown-menu";
import { deskUrl, docUrl } from "@/app/doc-routes";
import { PrintDialog } from "./print-dialog";
import useSWR from "swr";
import { GitBranch } from "lucide-react";
import { postCall } from "@/services/frappe";
import { DOC_MAKES, DOC_STATUS_ACTIONS, runStatusAction } from "./doc-actions-menu";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/common/status-badge";
import { StatCard } from "@/components/common/stat-card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Card } from "@/components/ui/card";
import { FrappeForm } from "@/components/forms/frappe-form";
import { EditableChildTable, type ChildRow } from "@/components/tables/child-table";
import { useDocument, useDocMutations, type Doc } from "@/hooks/useDoc";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useAuth } from "@/hooks/useAuth";
import { notifyDataChanged } from "@/hooks/useRealtime";
import { humanizeError } from "@/services/frappe";
import type { ChildRows, ChildTableSpec, DocConfig, DocField, DocValues, ExtraContext, FormAction } from "./doc-config";
import { ConnectionsPanel } from "./connections-panel";
import { ActivityTimeline, DocActionsPanel } from "@/components/common/activity-panel";
import { cn } from "@/utils/cn";

interface FormState {
  values: DocValues;
  rows: ChildRows;
}

const isEmpty = (v: unknown) => v === undefined || v === null || v === "" || (typeof v === "number" && Number.isNaN(v));
const newUuid = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Math.random()));

/**
 * Generic create / edit screen for a DocType, driven by a DocConfig.
 *
 *  - header fields via FrappeForm, child tables via EditableChildTable
 *  - `compute` re-runs after every edit (live calculations)
 *  - Save, Submit, Cancel document, Delete — as the document's state allows
 *  - read-only once submitted; child rows round-trip every field so nothing is lost on save
 */
/**
 * Keyed by DocType: two routes in one route group (e.g. /projects/list and /projects/tasks) render this component at
 * the same place, and React would otherwise reuse it — carrying one DocType's sort / filters / form state into the
 * other (sorting Tasks by Project's expected_end_date → "You do not have permission to access field").
 */
export function DocFormPage({ config }: { config: DocConfig }) {
  return <DocFormPageInner key={`${config.doctype}|${config.base}`} config={config} />;
}

function DocFormPageInner({ config }: { config: DocConfig }) {
  const { name: paramName } = useParams<{ name?: string }>();
  const routeName = config.single ? config.doctype : paramName;
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  // A "Create …" flow may route to /new with an unsaved, server-mapped document in router state.
  const prefill = (useLocation().state as { prefill?: DocValues } | null)?.prefill;
  const isNew = !routeName || routeName === "new";
  const { hasRole } = useAuth();
  const canWrite = hasRole();
  const { company } = useCompanyContext();
  const Icon = config.icon;

  const { data: doc, error: docError, isLoading: docLoading, mutate } = useDocument(config.doctype, isNew ? undefined : routeName);
  const { createDoc, updateDoc, deleteDoc, submitDoc, cancelDoc, loading: saving } = useDocMutations(config.doctype);

  const [state, setState] = useState<FormState>({ values: {}, rows: {} });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [confirm, setConfirm] = useState<"submit" | "cancel" | "delete" | null>(null);
  const [activeTab, setActiveTab] = useState<string>(() => searchParams.get("tab") ?? "");
  const loadedFor = useRef<string | null>(null);

  const specs = config.children ?? [];

  /** Run the config's live calculation over a state and merge the patches. */
  const withCompute = useCallback(
    (s: FormState): FormState => {
      const out = config.compute?.(s.values, s.rows);
      if (!out) return s;
      return { values: out.values ? { ...s.values, ...out.values } : s.values, rows: out.rows ? { ...s.rows, ...out.rows } : s.rows };
    },
    [config],
  );

  // Load the document (or the defaults for a new one) once per route.
  useEffect(() => {
    const key = isNew ? "new" : routeName ?? "";
    if (isNew) {
      if (loadedFor.current === key) return;
      loadedFor.current = key;
      const base = { doctype: config.doctype, ...(config.defaults?.({ company, params: searchParams }) ?? {}), ...(prefill ?? {}) };
      setState(withCompute({ values: base, rows: Object.fromEntries(specs.map((s) => [s.key, ((prefill?.[s.key] as ChildRow[]) ?? []).map((r) => ({ ...r, __uuid: newUuid() }))])) }));
    } else if (doc && loadedFor.current !== `${key}:${doc.modified}`) {
      loadedFor.current = `${key}:${doc.modified}`;
      setState({
        values: doc,
        rows: Object.fromEntries(specs.map((s) => [s.key, ((doc as Doc)[s.key] ?? []).map((r: ChildRow) => ({ ...r, __uuid: newUuid() }))])),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, isNew, routeName]);

  // A new document gets the company as soon as it is known.
  useEffect(() => {
    if (isNew && company) setState((s) => (s.values.company ? s : { ...s, values: { ...s.values, company } }));
  }, [isNew, company]);

  useEffect(() => {
    document.title = isNew ? `New ${config.singular}` : `${config.singular} — ${routeName}`;
  }, [isNew, routeName, config.singular]);

  const { values, rows } = state;

  // Workflow: the transitions the current user may take from the document's state (none when no workflow).
  const { data: transitions, mutate: refreshTransitions } = useSWR(
    !isNew && doc ? `wf-transitions:${config.doctype}:${routeName}:${(doc as Doc).modified}` : null,
    () => postCall<{ action: string; next_state: string }[]>("frappe.model.workflow.get_transitions", { doc: JSON.stringify(doc) }).catch(() => []),
    { revalidateOnFocus: false },
  );
  const [wfBusy, setWfBusy] = useState<string | null>(null);
  const applyWorkflow = async (action: string) => {
    setWfBusy(action);
    try {
      await postCall("frappe.model.workflow.apply_workflow", { doc: JSON.stringify(doc), action });
      toast.success(`${action} — done`);
      loadedFor.current = null;
      notifyDataChanged();
      await mutate();
      void refreshTransitions();
    } catch (err) {
      toast.error(humanizeError(err));
    } finally {
      setWfBusy(null);
    }
  };
  const docstatus: number | undefined = isNew ? 0 : (doc as Doc | undefined)?.docstatus;
  const readOnly = !canWrite || (config.submittable && (docstatus ?? 0) > 0) || false;

  // ---- editing ---------------------------------------------------------------------------------
  /** Apply a patch: keys naming a child table replace its rows, everything else is a header value. */
  const applyPatch = useCallback(
    (patch: DocValues) =>
      setState((s) => {
        const values = { ...s.values };
        const rows = { ...s.rows };
        Object.entries(patch).forEach(([k, v]) => {
          if (specs.some((sp) => sp.key === k) && Array.isArray(v)) rows[k] = v.map((r: ChildRow) => ({ ...r, __uuid: newUuid() }));
          else values[k] = v;
        });
        return withCompute({ values, rows });
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [withCompute],
  );

  const onChange = (fieldname: string, value: any) => {
    setState((s) => withCompute({ ...s, values: { ...s.values, [fieldname]: value } }));
    setErrors((e) => {
      if (!(fieldname in e)) return e;
      const next = { ...e };
      delete next[fieldname];
      return next;
    });
    const effect = config.linkEffects?.[fieldname];
    if (effect) {
      void Promise.resolve(effect(value, { ...values, [fieldname]: value }))
        .then((patch) => patch && applyPatch(patch))
        .catch((err) => console.warn(`${config.doctype}.${fieldname} auto-fill failed`, err));
    }
  };

  const setRows = (key: string, fn: (rows: ChildRow[]) => ChildRow[]) =>
    setState((s) => withCompute({ ...s, rows: { ...s.rows, [key]: fn(s.rows[key] ?? []) } }));

  const onRowChange = (spec: ChildTableSpec) => (index: number, fieldname: string, value: any) =>
    setRows(spec.key, (list) => list.map((r, i) => (i === index ? { ...r, [fieldname]: value } : r)));

  const onRowLinkChange = (spec: ChildTableSpec) => (index: number, fieldname: string, value: string) => {
    const effect = spec.linkEffects?.[fieldname];
    if (!effect) return;
    const row = (rows[spec.key] ?? [])[index];
    void Promise.resolve(effect(value, row ?? {}, values)).then((patch) => {
      if (patch) setRows(spec.key, (list) => list.map((r, i) => (i === index ? { ...r, ...patch } : r)));
    });
  };

  const addRow = (spec: ChildTableSpec) =>
    setRows(spec.key, (list) => [...list, { ...(spec.newRow?.(values, list) ?? {}), __uuid: newUuid() }]);
  const removeRow = (spec: ChildTableSpec) => (index: number) => setRows(spec.key, (list) => list.filter((_, i) => i !== index));
  const duplicateRow = (spec: ChildTableSpec) => (index: number) =>
    setRows(spec.key, (list) => [...list.slice(0, index + 1), { ...list[index], __uuid: newUuid(), name: undefined }, ...list.slice(index + 1)]);

  // ---- validation + payload --------------------------------------------------------------------
  const visibleFields: DocField[] = useMemo(() => config.fields.filter((f) => !f.showIf || f.showIf(values)), [config.fields, values]);

  // ---- tabs --------------------------------------------------------------------------------------
  // "Tab Break" fields split the form; child tables join a tab through `spec.tab` (default: the first tab).
  // Forms without tab breaks get automatic tabs: Details, then one tab per child table when there are two or more.
  const shownSpecs = specs.filter((sp) => !sp.showIf || sp.showIf(values));
  const explicitTabs = visibleFields.some((f) => f.fieldtype === "Tab Break");
  const autoTableTabs = !explicitTabs && shownSpecs.length >= 2;
  const tabs = useMemo(() => {
    const out: { label: string; fields: DocField[] }[] = [];
    visibleFields.forEach((f) => {
      if (f.fieldtype === "Tab Break") out.push({ label: f.label ?? "", fields: [] });
      else {
        if (!out.length) out.push({ label: "Details", fields: [] });
        out[out.length - 1].fields.push(f);
      }
    });
    if (!out.length) out.push({ label: "Details", fields: [] });
    if (autoTableTabs) shownSpecs.forEach((sp) => out.push({ label: sp.label, fields: [] }));
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleFields, autoTableTabs, shownSpecs.map((sp) => sp.key).join()]);
  const tabOfSpec = (sp: ChildTableSpec) => sp.tab ?? (autoTableTabs ? sp.label : tabs[0]?.label);
  const specsOf = (label: string) => shownSpecs.filter((sp) => tabOfSpec(sp) === label);
  const tabErrorCount = (t: { label: string; fields: DocField[] }, errs: Record<string, string>) =>
    t.fields.filter((f) => errs[f.fieldname]).length +
    specsOf(t.label).reduce((n, sp) => n + Object.keys(errs).filter((k) => k === sp.key || k.startsWith(`${sp.key}_`)).length, 0);

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    visibleFields.forEach((f) => {
      if (f.reqd && !f.read_only && f.fieldtype !== "Section Break" && f.fieldtype !== "Column Break" && isEmpty(values[f.fieldname])) {
        next[f.fieldname] = `${f.label ?? f.fieldname} is required`;
      }
    });
    specs.filter((spec) => !spec.showIf || spec.showIf(values)).forEach((spec) => {
      const list = rows[spec.key] ?? [];
      if ((spec.minRows ?? 0) > list.length) next[`${spec.key}`] = `Add at least ${spec.minRows} row${spec.minRows === 1 ? "" : "s"} to ${spec.label}`;
      list.forEach((row, i) => {
        spec.columns.forEach((col) => {
          if (col.reqd && !col.read_only && col.fieldtype !== "Check" && isEmpty(row[col.fieldname])) {
            next[`${spec.key}_${i}_${col.fieldname}`] = `${spec.label} row ${i + 1}: ${col.label ?? col.fieldname} is required`;
          }
        });
      });
    });
    Object.assign(next, config.validate?.(values, rows) ?? {});
    setErrors(next);
    const badTab = tabs.find((t) => tabErrorCount(t, next) > 0);
    if (badTab) setActiveTab(badTab.label);
    if (Object.keys(next).length) {
      const first = Object.values(next)[0];
      toast.error(Object.keys(next).length > 1 ? `${first} (+${Object.keys(next).length - 1} more)` : first);
    }
    return Object.keys(next).length === 0;
  };

  const buildPayload = (): Doc => {
    const payload: Doc = { ...values };
    (config.omitOnSave ?? []).forEach((k) => delete payload[k]);
    specs.forEach((spec) => {
      // Rows keep every field they were loaded with (a save replaces the whole table), minus UI-only keys.
      payload[spec.key] = (rows[spec.key] ?? []).map(({ __uuid, ...rest }, i) => ({ doctype: spec.doctype, ...rest, idx: i + 1 }));
    });
    Object.keys(payload).forEach((k) => payload[k] === undefined && delete payload[k]);
    return payload;
  };

  // ---- actions ---------------------------------------------------------------------------------
  const save = async (): Promise<string | undefined> => {
    if (!canWrite) {
      toast.error(`You do not have permission to save ${config.plural.toLowerCase()}`);
      return undefined;
    }
    if (!validate()) return undefined;
    try {
      if (isNew) {
        const created = await createDoc(buildPayload());
        toast.success(`${config.singular} ${created.name ?? ""} created`);
        notifyDataChanged();
        navigate(`${config.base}/${encodeURIComponent(String(created.name))}`, { replace: true });
        return String(created.name);
      }
      const updated = await updateDoc(routeName!, buildPayload());
      loadedFor.current = null;
      setState({
        values: updated,
        rows: Object.fromEntries(specs.map((s) => [s.key, ((updated as Doc)[s.key] ?? []).map((r: ChildRow) => ({ ...r, __uuid: newUuid() }))])),
      });
      toast.success(`${config.singular} saved`);
      notifyDataChanged();
      void mutate();
      return routeName;
    } catch (err) {
      toast.error(humanizeError(err));
      return undefined;
    }
  };

  const run = async (kind: "submit" | "cancel" | "delete") => {
    if (!routeName || isNew) return;
    setBusy(true);
    try {
      if (kind === "submit") {
        if (!(await save())) return;
        await submitDoc(routeName);
        toast.success(`${config.singular} submitted`);
      } else if (kind === "cancel") {
        await cancelDoc(routeName);
        toast.success(`${config.singular} cancelled`);
      } else {
        await deleteDoc(routeName);
        toast.success("Deleted");
        notifyDataChanged();
        navigate(config.base);
        return;
      }
      loadedFor.current = null;
      notifyDataChanged();
      void mutate();
    } catch (err) {
      toast.error(humanizeError(err));
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  // ---- render ----------------------------------------------------------------------------------
  if (!isNew && docLoading && !doc) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-56 animate-pulse rounded bg-muted" />
        <div className="grid grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-md bg-muted" />
          ))}
        </div>
        <div className="h-72 w-full animate-pulse rounded-md bg-muted" />
      </div>
    );
  }
  if (docError) {
    return (
      <div className="py-10 text-center">
        <p className="text-sm text-muted-foreground">{humanizeError(docError)}</p>
        <div className="mt-3 flex justify-center gap-2">
          <Button variant="outline" onClick={() => navigate(config.base)}>
            Back to list
          </Button>
          <Button onClick={() => void mutate()}>Retry</Button>
        </div>
      </div>
    );
  }

  const statusLabel: string | undefined =
    values.workflow_state ??
    values.status ?? (docstatus === 1 ? "Submitted" : docstatus === 2 ? "Cancelled" : isNew || !config.submittable ? undefined : "Draft");
  const summary = config.summary?.(values, rows) ?? [];
  const title = config.titleOf?.(values) ?? (isNew ? `New ${config.singular}` : routeName ?? config.singular);
  const busyAny = saving || busy;

  const extraCtx: ExtraContext = { name: routeName, isNew, docstatus, readOnly: Boolean(readOnly), values, rows, reload: () => void mutate(), patch: applyPatch };
  const connectionsOn = config.connections !== false && !isNew && !config.single;
  const activityOn = !isNew && !config.single;
  const showTabBar = tabs.length > 1 || connectionsOn || activityOn;
  const currentTab = tabs.some((t) => t.label === activeTab) || (activeTab === "Connections" && connectionsOn) || (activeTab === "Activity" && activityOn) ? activeTab : tabs[0]?.label ?? "";
  // Assigned to / attachments / tags / shared-with sit beside the Activity tab only — the other tabs get the full width
  // forms without a tab bar keep the panel as a sidebar; with tabs it lives inside the Activity tab
  const sidebarOn = activityOn && !!routeName && !showTabBar;

  // ---- Actions menu ----------------------------------------------------------------------------
  const openDoc = (r: { doctype: string; name: string }) => {
    const u = docUrl(r.doctype, r.name);
    if (u.external) window.open(u.href, "_blank");
    else navigate(u.href);
  };
  const runServer = async (label: string, fn: () => Promise<{ doctype: string; name: string }>) => {
    setBusy(true);
    try {
      const r = await fn();
      toast.success(`${label}: ${r.doctype} ${r.name} created as draft`);
      notifyDataChanged();
      openDoc(r);
    } catch (err) {
      toast.error(humanizeError(err));
    } finally {
      setBusy(false);
    }
  };
  const actionItems: DropdownItem[] = [];
  if (!isNew && routeName) {
    // The doctype's standard "Create →" mappers (Sales Order → Delivery Note, …) plus the config's own actions.
    const standard = (DOC_MAKES[config.doctype] ?? [])
      .filter((m) => (m.show ? m.show({ ...values, name: routeName, docstatus }) : docstatus === 1))
      .map((m): FormAction => ({
        label: `Create ${m.label}`,
        group: "create" as const,
        make: m.method,
        makeArgs: m.args ? () => m.args!({ ...values, name: routeName }, config.doctype) : undefined,
      }));
    const custom = [...standard, ...(config.actions ?? []).filter((a) => (a.show ? a.show(extraCtx) : true))];
    const create = custom.filter((a) => a.group === "create" || a.make);
    const other = custom.filter((a) => !(a.group === "create" || a.make));
    const toItem = (a: (typeof custom)[number]): DropdownItem => ({
      label: a.label,
      icon: a.icon ? <a.icon className="h-4 w-4" /> : a.make ? <PlusCircle className="h-4 w-4" /> : undefined,
      onClick: () =>
        a.make
          ? void runServer(a.label, () => postCall("mm_core.form_actions.make_mapped", { method: a.make, source_name: routeName, args: a.makeArgs ? JSON.stringify(a.makeArgs(extraCtx)) : undefined }))
          : void Promise.resolve(a.run?.(extraCtx)).catch((e) => toast.error(humanizeError(e))),
    });
    // grouped like the desk: Create · Documents · Messages · Actions, each with tinted icon tiles
    const docs = other.filter((a) => /^Generate /.test(a.label));
    const msgs = other.filter((a) => /^Send /.test(a.label));
    const rest = other.filter((a) => !docs.includes(a) && !msgs.includes(a));
    const section = (title: string, list: typeof custom, tone: string) => {
      if (!list.length) return;
      // under "Documents" / "Messages" the verb is implied — "Allotment Letter" rather than "Generate Allotment Letter"
      const short = (l: string) => (title === "Documents" ? l.replace(/^Generate /, "") : title === "Messages" ? l.replace(/^Send /, "") : l);
      actionItems.push({ label: title, heading: true }, ...list.map((a) => ({ ...toItem(a), label: short(a.label), tone })));
    };
    section("Create", create, "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400");
    section("Actions", rest, "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400");
    section("Documents", docs, "bg-amber-500/15 text-amber-600 dark:text-amber-400");
    section("Messages", msgs, "bg-sky-500/15 text-sky-600 dark:text-sky-400");
    // The desk's "Status" menu: Close / Hold / Stop / Re-open.
    const current = { ...values, name: routeName, docstatus };
    const statuses = (DOC_STATUS_ACTIONS[config.doctype] ?? []).filter((a) => a.show(current));
    if (statuses.length) actionItems.push({ label: "Status", heading: true });
    actionItems.push(...statuses.map((a): DropdownItem => ({
      label: a.label,
      tone: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
      icon: <CircleDot className="h-4 w-4" />,
      onClick: () => void (async () => {
        setBusy(true);
        if (await runStatusAction(a, current)) { loadedFor.current = null; await mutate(); }
        setBusy(false);
      })(),
    })));
    actionItems.push(
      { label: "More", heading: true },
      { label: "Refresh", icon: <RefreshCw className="h-4 w-4" />, onClick: () => { loadedFor.current = null; void mutate(); } },
      ...(!config.single && canWrite
        ? [{ label: "Duplicate", icon: <Copy className="h-4 w-4" />, onClick: () => void runServer("Duplicate", () => postCall("mm_core.form_actions.duplicate", { doctype: config.doctype, name: routeName })) }]
        : []),
      { label: "Print…", icon: <Printer className="h-4 w-4" />, onClick: () => setPrinting(true) },
      { label: "Open in ERPNext desk", icon: <ExternalLink className="h-4 w-4" />, onClick: () => window.open(deskUrl(config.doctype, config.single ? undefined : routeName), "_blank") },
      { label: "Copy link", icon: <LinkIcon className="h-4 w-4" />, onClick: () => void navigator.clipboard?.writeText(window.location.href).then(() => toast.success("Link copied")) },
    );
  }
  const renderSpec = (spec: ChildTableSpec) => {
    const list = rows[spec.key] ?? [];
    const ro = readOnly || spec.readOnly;
    return (
      <Card key={spec.key} className="rounded-2xl p-5 sm:p-6">
        {errors[spec.key] && <p className="mb-2 text-sm text-destructive">{errors[spec.key]}</p>}
        <EditableChildTable
          toolbarStart={
            <div className="min-w-0">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <span className="h-4 w-1 rounded-full bg-primary" />
                {spec.label}
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{list.length}</span>
              </h3>
              {spec.description && <p className="mt-0.5 text-xs text-muted-foreground">{spec.description}</p>}
            </div>
          }
          onAddRow={ro ? undefined : () => addRow(spec)}
          columns={spec.columns}
          rows={spec.derive ? list.map(spec.derive) : list}
          onChange={onRowChange(spec)}
          onLinkChange={onRowLinkChange(spec)}
          renderCell={spec.renderCell}
          onRemoveRow={ro ? undefined : removeRow(spec)}
          onDuplicateRow={ro ? undefined : duplicateRow(spec)}
          readOnly={ro}
          totals={spec.totals?.(list)}
          editableInDialog={Boolean(spec.dialogColumns?.length)}
          extraDialogColumns={spec.dialogColumns}
          columnPicker={spec.wide}
          // ERPNext "Configure Columns" (fields + widths), saved per user and shared with the desk grid
          gridSettings={spec.doctype ? { parent: config.doctype, child: spec.doctype } : undefined}
          fitColumns
          emptyMessage={ro ? "Nothing here." : "No rows yet. Click Add Row to begin."}
        />
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
        <div aria-hidden className="pointer-events-none absolute -right-16 -top-24 h-56 w-56 rounded-full bg-primary/10 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary via-primary/60 to-transparent" />
      <PageHeader
        className="relative mb-0"
        title={title}
        subtitle={isNew ? config.subtitle : config.singular}
        icon={<Icon className="h-5 w-5" />}
        badge={statusLabel && <StatusBadge status={statusLabel} className="px-3 py-1" />}
        actions={
          <>
            <Button variant="neutral" onClick={() => navigate(config.base)} disabled={busyAny} title={readOnly ? "Back to the list" : "Discard changes and go back"}>
              {readOnly ? <ArrowLeft className="h-4 w-4" /> : <X className="h-4 w-4" />} {readOnly ? "Back" : "Cancel"}
            </Button>
            {(transitions ?? []).slice(0, 3).map((t) => (
              <Button key={t.action} variant={/approve|accept|confirm/i.test(t.action) ? "submit" : /reject|cancel|decline/i.test(t.action) ? "danger" : "workflow"}
                onClick={() => void applyWorkflow(t.action)} disabled={busyAny || Boolean(wfBusy)} title={`→ ${t.next_state}`}>
                <GitBranch className="h-4 w-4" /> {wfBusy === t.action ? "Working…" : t.action}
              </Button>
            ))}
            {actionItems.length > 0 && (
              <DropdownMenu
                width="w-72"
                items={actionItems}
                trigger={
                  <Button variant="menu" disabled={busyAny}>
                    <Zap className="h-4 w-4" /> Actions <ChevronDown className="h-4 w-4 opacity-70" />
                  </Button>
                }
              />
            )}
            {!isNew && !config.single && canWrite && (!config.submittable || docstatus === 0) && (
              <Button variant="danger" onClick={() => setConfirm("delete")} disabled={busyAny}>
                <Trash2 className="h-4 w-4" /> Delete
              </Button>
            )}
            {!readOnly && (
              <Button variant="save" onClick={() => void save()} disabled={busyAny}>
                <Save className="h-4 w-4" /> {isNew ? "Save" : "Update"}
              </Button>
            )}
            {!isNew && config.submittable && docstatus === 0 && canWrite && !(transitions ?? []).length && (
              <Button variant="submit" onClick={() => setConfirm("submit")} disabled={busyAny}>
                <Send className="h-4 w-4" /> Submit
              </Button>
            )}
            {!isNew && config.submittable && docstatus === 1 && canWrite && (
              <Button variant="danger" onClick={() => setConfirm("cancel")} disabled={busyAny}>
                <Ban className="h-4 w-4" /> Cancel document
              </Button>
            )}
          </>
        }
      />
      </div>

      {summary.length > 0 && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
          {summary.map((s) => (
            <StatCard key={s.label} label={s.label} value={s.value} tone={s.tone ?? "primary"} icon={<Icon className="h-4 w-4" />} size="sm" />
          ))}
        </div>
      )}

      <div className={cn(sidebarOn && "grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_300px]")}>
      <div className="min-w-0 space-y-6">
      {showTabBar ? (
        <>
          <div className="sticky top-14 z-20 -mx-1 overflow-x-auto rounded-xl border border-border bg-card/90 p-1 shadow-sm backdrop-blur scrollbar-thin">
            <div role="tablist" className="flex min-w-max gap-1">
              {[...tabs.map((t) => t.label), ...(connectionsOn ? ["Connections"] : []), ...(activityOn ? ["Activity"] : [])].map((label) => {
                const t = tabs.find((x) => x.label === label);
                const n = t ? tabErrorCount(t, errors) : 0;
                const TabIcon = label === "Connections" ? Link2 : label === "Activity" ? History : config.tabIcons?.[label];
                const on = currentTab === label;
                return (
                  <button
                    key={label}
                    type="button"
                    role="tab"
                    aria-selected={on}
                    onClick={() => setActiveTab(label)}
                    className={cn(
                      "flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-all",
                      on ? "bg-primary text-primary-foreground shadow-md shadow-primary/25" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    {TabIcon && <TabIcon className="h-4 w-4" />}
                    {label}
                    {n > 0 && <span className="rounded-full bg-destructive px-1.5 text-[10px] font-bold text-white">{n}</span>}
                  </button>
                );
              })}
            </div>
          </div>
          {currentTab === "Connections" && routeName ? (
            <ConnectionsPanel key={config.doctype} doctype={config.doctype} name={routeName} />
          ) : currentTab === "Activity" && routeName ? (
            // Comments, field changes and emails — with "New Email" (Quill composer), like the desk's timeline.
            // activity chain on the left; comments, assignments, attachments, tags and sharing in a right-hand panel
            <ActivityTimeline doctype={config.doctype} docname={routeName} aside={<DocActionsPanel doctype={config.doctype} docname={routeName} title={title} caption={`${config.singular} · assignments, files & sharing`} />} />
          ) : (
            (() => {
              const t = tabs.find((x) => x.label === currentTab) ?? tabs[0];
              const panel = config.tabPanels?.[t.label];
              const hasFields = t.fields.some((f) => f.fieldtype !== "Section Break" && f.fieldtype !== "Column Break");
              return (
                <div key={t.label} className="space-y-6">
                  {panel?.before?.(extraCtx)}
                  {hasFields && (
                    <div>
                      <FrappeForm sectionRows={config.sectionRows} fields={t.fields} values={values} errors={errors} readOnly={readOnly} onChange={onChange} />
                    </div>
                  )}
                  {specsOf(t.label).map(renderSpec)}
                  {panel?.after?.(extraCtx)}
                </div>
              );
            })()
          )}
        </>
      ) : (
        <>
          <FrappeForm sectionRows={config.sectionRows} fields={visibleFields} values={values} errors={errors} readOnly={readOnly} onChange={onChange} />
          {shownSpecs.map(renderSpec)}
        </>
      )}

      {config.extra?.(extraCtx)}

      {!readOnly && (
        // Save stays in reach on long forms — the header buttons scroll away.
        <div className="sticky bottom-3 z-20 flex items-center justify-between gap-3 rounded-2xl border bg-card/90 px-4 py-2.5 shadow-lg backdrop-blur">
          <p className="min-w-0 truncate text-xs text-muted-foreground">
            {isNew ? `New ${config.singular.toLowerCase()}` : <>Editing <span className="font-medium text-foreground">{title}</span></>}
          </p>
          <div className="flex shrink-0 gap-2">
            <Button variant="neutral" size="sm" onClick={() => navigate(config.base)} disabled={busyAny}><X className="h-3.5 w-3.5" />Cancel</Button>
            <Button variant="save" size="sm" onClick={() => void save()} disabled={busyAny}>
              <Save className="h-4 w-4" /> {isNew ? "Save" : "Update"}
            </Button>
          </div>
        </div>
      )}
      </div>
      {sidebarOn && (
        // Frappe's form sidebar: assignments, attachments, tags and sharing for this record.
        <aside className="xl:sticky xl:top-20">
          <DocActionsPanel doctype={config.doctype} docname={routeName} />
        </aside>
      )}
      </div>


      <ConfirmDialog
        open={confirm === "submit"}
        onClose={() => setConfirm(null)}
        title={`Submit ${config.singular}`}
        description={`Submit this ${config.singular.toLowerCase()}? After submit it can no longer be edited (only cancelled).`}
        confirmLabel="Submit"
        loading={busy}
        onConfirm={() => void run("submit")}
      />
      <ConfirmDialog
        open={confirm === "cancel"}
        onClose={() => setConfirm(null)}
        title={`Cancel ${routeName}`}
        description={`Cancel this ${config.singular.toLowerCase()}? Its ledger and stock effects are reversed.`}
        confirmLabel="Cancel document"
        destructive
        loading={busy}
        onConfirm={() => void run("cancel")}
      />
      <ConfirmDialog
        open={confirm === "delete"}
        onClose={() => setConfirm(null)}
        title={`Delete ${routeName}?`}
        description={`This permanently removes the ${config.singular.toLowerCase()}.`}
        confirmLabel="Delete"
        destructive
        loading={busy}
        onConfirm={() => void run("delete")}
      />
      {routeName && !isNew && <PrintDialog doctype={config.doctype} name={routeName} open={printing} onClose={() => setPrinting(false)} />}
    </div>
  );
}
