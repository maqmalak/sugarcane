import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { Users, Plus } from "lucide-react";
import { useFrappeDeleteDoc } from "frappe-react-sdk";
import { PageHeader } from "@/components/common/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/common/error-state";
import { EmptyState } from "@/components/common/empty-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { TreeExplorer } from "@/components/common/tree-explorer";
import { useSupplierGroups } from "@/hooks/useSuppliers";
import { notifyDataChanged } from "@/hooks/useRealtime";
import { humanizeError } from "@/services/frappe";
import type { SupplierGroup } from "@/types/frappe";

/** Supplier Group tree — full page create/edit lives at /masters/supplier-groups/:name. */
export function SupplierGroupsPage() {
  const navigate = useNavigate();
  const { data, error, isLoading, mutate } = useSupplierGroups();
  const { deleteDoc, loading: deleting } = useFrappeDeleteDoc();
  const [deleteTarget, setDeleteTarget] = useState<SupplierGroup | null>(null);

  const treeNodes = useMemo(
    () =>
      (data ?? []).map((g) => ({
        name: g.name,
        label: g.supplier_group_name || g.name,
        parent: g.parent_supplier_group,
        isGroup: Boolean(g.is_group),
        raw: g,
      })),
    [data],
  );

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteDoc("Supplier Group", deleteTarget.name);
      toast.success("Supplier Group deleted");
      setDeleteTarget(null);
      await mutate();
      notifyDataChanged();
    } catch (e) {
      toast.error(humanizeError(e));
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Supplier Groups"
        subtitle="Supplier Group hierarchy used to organize the Supplier master"
        icon={<Users className="h-5 w-5" />}
        actions={
          <Button size="sm" onClick={() => navigate("/masters/supplier-groups/new")}>
            <Plus className="h-3.5 w-3.5" /> New Supplier Group
          </Button>
        }
      />

      <Card>
        <CardContent className="pt-5">
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : error ? (
            <ErrorState error={error} onRetry={() => void mutate()} />
          ) : treeNodes.length === 0 ? (
            <EmptyState title="No supplier groups found" description="Create one to start organizing suppliers." />
          ) : (
            <TreeExplorer
              nodes={treeNodes}
              onAddChild={(node) => navigate(`/masters/supplier-groups/new?parent=${encodeURIComponent(node.name)}`)}
              onEdit={(node) => navigate(`/masters/supplier-groups/${encodeURIComponent(node.name)}`)}
              onDelete={(node) => setDeleteTarget(node.raw)}
            />
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={!!deleteTarget}
        title={`Delete "${deleteTarget?.supplier_group_name || deleteTarget?.name}"?`}
        description="This action cannot be undone."
        confirmLabel="Delete"
        destructive
        loading={deleting}
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}
