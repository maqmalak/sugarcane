import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { Boxes, Plus } from "lucide-react";
import { useFrappeDeleteDoc } from "frappe-react-sdk";
import { PageHeader } from "@/components/common/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/common/error-state";
import { EmptyState } from "@/components/common/empty-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { TreeExplorer } from "@/components/common/tree-explorer";
import { useItemGroups } from "@/hooks/useItems";
import { notifyDataChanged } from "@/hooks/useRealtime";
import { humanizeError } from "@/services/frappe";
import type { ItemGroup } from "@/types/frappe";

/** Item Group tree — full page create/edit lives at /masters/item-groups/:name. */
export function ItemGroupsPage() {
  const navigate = useNavigate();
  const { data, error, isLoading, mutate } = useItemGroups();
  const { deleteDoc, loading: deleting } = useFrappeDeleteDoc();
  const [deleteTarget, setDeleteTarget] = useState<ItemGroup | null>(null);

  const treeNodes = useMemo(
    () =>
      (data ?? []).map((g) => ({
        name: g.name,
        label: g.item_group_name || g.name,
        parent: g.parent_item_group,
        isGroup: Boolean(g.is_group),
        raw: g,
      })),
    [data],
  );

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteDoc("Item Group", deleteTarget.name);
      toast.success("Item Group deleted");
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
        title="Item Groups"
        subtitle="Item Group hierarchy used to organize the Item master"
        icon={<Boxes className="h-5 w-5" />}
        actions={
          <Button size="sm" onClick={() => navigate("/masters/item-groups/new")}>
            <Plus className="h-3.5 w-3.5" /> New Item Group
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
            <EmptyState title="No item groups found" description="Create one to start organizing items." />
          ) : (
            <TreeExplorer
              nodes={treeNodes}
              onAddChild={(node) => navigate(`/masters/item-groups/new?parent=${encodeURIComponent(node.name)}`)}
              onEdit={(node) => navigate(`/masters/item-groups/${encodeURIComponent(node.name)}`)}
              onDelete={(node) => setDeleteTarget(node.raw)}
            />
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={!!deleteTarget}
        title={`Delete "${deleteTarget?.item_group_name || deleteTarget?.name}"?`}
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
