import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronRight, ChevronDown, Folder, FolderOpen, Circle, Plus, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/utils/cn";

export interface TreeExplorerNode {
  name: string;
  /** Display name — e.g. account_name / cost_center_name. */
  label: string;
  /** Short code shown before the label (account_number / cost_center_number). */
  code?: string;
  parent?: string;
  isGroup?: boolean;
  disabled?: boolean;
}

interface InternalNode<T> {
  data: T;
  children: InternalNode<T>[];
}

function buildTree<T extends TreeExplorerNode>(nodes: T[]): InternalNode<T>[] {
  const byName = new Map<string, InternalNode<T>>(nodes.map((n) => [n.name, { data: n, children: [] }]));
  const roots: InternalNode<T>[] = [];
  for (const node of byName.values()) {
    const parent = node.data.parent ? byName.get(node.data.parent) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

function sortChildren<T extends TreeExplorerNode>(children: InternalNode<T>[]): InternalNode<T>[] {
  return children
    .slice()
    .sort((a, b) => (a.data.isGroup === b.data.isGroup ? a.data.label.localeCompare(b.data.label) : a.data.isGroup ? -1 : 1));
}

/**
 * Pre-order flattening of the tree (group-first, alpha within type — the
 * same order rows appear in when every node is expanded) annotated with
 * depth. Used for the hierarchical print/PDF view, which has no expand
 * state of its own and needs every row up front.
 */
export function flattenWithDepth<T extends TreeExplorerNode>(nodes: T[]): { node: T; depth: number }[] {
  const tree = buildTree(nodes);
  const out: { node: T; depth: number }[] = [];
  const walk = (list: InternalNode<T>[], depth: number) => {
    sortChildren(list).forEach((n) => {
      out.push({ node: n.data, depth });
      if (n.children.length) walk(n.children, depth + 1);
    });
  };
  walk(tree, 0);
  return out;
}

/** Muted "code — label" text: a tabular-nums code chip followed by the display name, sized to stay on one row. */
function NodeLabel({ node, isGroup }: { node: TreeExplorerNode; isGroup: boolean }) {
  return (
    <span className="flex min-w-0 items-baseline gap-1.5 truncate whitespace-nowrap">
      {node.code && <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">{node.code}</span>}
      {node.code && <span className="shrink-0 text-muted-foreground/40">–</span>}
      <span className={cn("truncate text-sm", isGroup ? "font-semibold text-foreground" : "text-foreground/90")}>{node.label}</span>
    </span>
  );
}

function Row<T extends TreeExplorerNode>({
  node,
  depth,
  isLast,
  ancestorLines,
  expanded,
  onToggle,
  renderBadges,
  onAddChild,
  onEdit,
  onDelete,
}: {
  node: InternalNode<T>;
  depth: number;
  isLast: boolean;
  /** Whether each ancestor level still has further siblings below it (draws a continuing guide line vs. a blank gap). */
  ancestorLines: boolean[];
  expanded: Set<string>;
  onToggle: (name: string) => void;
  renderBadges?: (node: T, depth: number) => ReactNode;
  onAddChild?: (parent: T) => void;
  onEdit?: (node: T) => void;
  onDelete?: (node: T) => void;
}) {
  const hasChildren = node.children.length > 0;
  const isGroup = Boolean(node.data.isGroup);
  const isOpen = expanded.has(node.data.name);
  const sortedChildren = useMemo(() => sortChildren(node.children), [node.children]);

  return (
    <div>
      <div className="group flex items-stretch">
        {ancestorLines.map((hasLine, i) => (
          <span key={i} className={cn("w-5 shrink-0", hasLine && "border-r border-border")} />
        ))}
        {depth > 0 && (
          <span className="relative w-5 shrink-0">
            <span className={cn("absolute left-0 top-0 w-px bg-border", isLast ? "h-[17px]" : "h-full")} />
            <span className="absolute left-0 top-[17px] h-px w-2.5 bg-border" />
          </span>
        )}
        <div className="flex flex-1 items-center gap-2 overflow-hidden rounded-md px-1.5 py-1.5 text-sm transition-colors hover:bg-accent">
          <button
            type="button"
            onClick={() => hasChildren && onToggle(node.data.name)}
            className={cn("flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden text-left", !hasChildren && "cursor-default")}
          >
            {hasChildren ? (
              isOpen ? (
                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              )
            ) : (
              <span className="w-3.5 shrink-0" />
            )}
            {isGroup ? (
              isOpen ? (
                <FolderOpen className="h-4 w-4 shrink-0 text-amber-500" />
              ) : (
                <Folder className="h-4 w-4 shrink-0 text-amber-500" />
              )
            ) : (
              <Circle className="h-2.5 w-2.5 shrink-0 fill-current text-muted-foreground/50" strokeWidth={0} />
            )}
            <NodeLabel node={node.data} isGroup={isGroup} />
          </button>
          <div className="flex shrink-0 items-center gap-1.5">
            {renderBadges?.(node.data, depth)}
            {node.data.disabled && (
              <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium text-destructive">Disabled</span>
            )}
            <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
              {isGroup && onAddChild && (
                <button
                  type="button"
                  title="Add child"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAddChild(node.data);
                  }}
                  className="rounded p-1 text-muted-foreground hover:bg-background hover:text-foreground"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              )}
              {onEdit && (
                <button
                  type="button"
                  title="Edit"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit(node.data);
                  }}
                  className="rounded p-1 text-muted-foreground hover:bg-background hover:text-foreground"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              )}
              {onDelete && (
                <button
                  type="button"
                  title="Delete"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(node.data);
                  }}
                  className="rounded p-1 text-muted-foreground hover:bg-background hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
      {hasChildren && isOpen && (
        <div>
          {sortedChildren.map((child, i) => (
            <Row
              key={child.data.name}
              node={child}
              depth={depth + 1}
              isLast={i === sortedChildren.length - 1}
              ancestorLines={[...ancestorLines, !isLast]}
              expanded={expanded}
              onToggle={onToggle}
              renderBadges={renderBadges}
              onAddChild={onAddChild}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Generic nested-set tree explorer (Chart of Accounts, Cost Center, ...):
 * expand/collapse with connector guide lines, per-node hover actions (add
 * child / edit / delete), and an Expand All / Collapse All toolbar.
 * Presentational only — the parent page owns data fetching and the
 * create/edit/delete dialogs.
 */
export function TreeExplorer<T extends TreeExplorerNode>({
  nodes,
  renderBadges,
  onAddChild,
  onEdit,
  onDelete,
  toolbarExtra,
  defaultLevel = 2,
}: {
  nodes: T[];
  renderBadges?: (node: T, depth: number) => ReactNode;
  onAddChild?: (parent: T) => void;
  onEdit?: (node: T) => void;
  onDelete?: (node: T) => void;
  toolbarExtra?: ReactNode;
  /** Depth the tree starts expanded to (1 = roots only, 2 = roots + their direct children, ...). */
  defaultLevel?: number;
}) {
  const tree = useMemo(() => sortChildren(buildTree(nodes)), [nodes]);
  const flatWithDepth = useMemo(() => flattenWithDepth(nodes), [nodes]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [levelInput, setLevelInput] = useState(defaultLevel);

  const toggle = (name: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  const expandAll = () => setExpanded(new Set(nodes.filter((n) => n.isGroup).map((n) => n.name)));
  const collapseAll = () => setExpanded(new Set());

  // Expand every group node shallower than the target level, so exactly
  // `level` rows of depth are visible (level 1 = roots only, level 2 = roots
  // + their direct children, ...).
  const applyLevel = (level: number) =>
    setExpanded(new Set(flatWithDepth.filter(({ node, depth }) => node.isGroup && depth <= level - 2).map(({ node }) => node.name)));

  // Expand to `defaultLevel` the first time this tree's data loads — guarded
  // so it only fires once per fresh dataset, not on every re-render or on a
  // user's own expand/collapse clicks.
  const appliedDefault = useRef(false);
  useEffect(() => {
    if (nodes.length > 0 && !appliedDefault.current) {
      appliedDefault.current = true;
      applyLevel(defaultLevel);
    }
    if (nodes.length === 0) appliedDefault.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <button onClick={expandAll} className="rounded-md border border-input px-2.5 py-1.5 hover:bg-accent">
            Expand All
          </button>
          <button onClick={collapseAll} className="rounded-md border border-input px-2.5 py-1.5 hover:bg-accent">
            Collapse All
          </button>
          <label htmlFor="tree-level" className="text-muted-foreground">
            Level
          </label>
          <input
            id="tree-level"
            type="number"
            min={1}
            value={levelInput}
            onChange={(e) => setLevelInput(Math.max(1, Number(e.target.value) || 1))}
            className="h-[30px] w-14 rounded-md border border-input bg-transparent px-2 text-xs"
          />
          <button onClick={() => applyLevel(levelInput)} className="rounded-md border border-input px-2.5 py-1.5 hover:bg-accent">
            Set Level
          </button>
        </div>
        {toolbarExtra}
      </div>
      <div className="scrollbar-thin max-h-[65vh] overflow-y-auto rounded-md border border-border/60 bg-card/40 p-1.5">
        {tree.map((root, i) => (
          <Row
            key={root.data.name}
            node={root}
            depth={0}
            isLast={i === tree.length - 1}
            ancestorLines={[]}
            expanded={expanded}
            onToggle={toggle}
            renderBadges={renderBadges}
            onAddChild={onAddChild}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </div>
    </div>
  );
}
