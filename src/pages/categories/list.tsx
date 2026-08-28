import { useEffect, useState, useCallback, useMemo } from 'react';
import { Link } from 'react-router';
import ReactFlow, {
  Background,
  Controls,
  Handle,
  Position,
  Node,
  Edge,
  MarkerType,
  ReactFlowProvider,
  useNodesState,
  useEdgesState,
  useReactFlow,
} from 'reactflow';
import { supabaseClient } from '../../providers/supabase-client';
import { useDashboardStore } from '../../store/dashboardStore';

import 'reactflow/dist/style.css';

interface Category {
  id: string;
  name: string;
  level: number;
  parent_id: string | null;
}

// ---------- Node sizes by level ----------
const NODE_SIZES = {
  1: { width: 180, height: 90, font: 14, padding: 12 },
  2: { width: 150, height: 78, font: 12, padding: 10 },
  3: { width: 130, height: 68, font: 11, padding: 8 },
};

const CategoryNode = ({ data }: { data: any }) => {
  const size = NODE_SIZES[data.level as 1 | 2 | 3] ?? NODE_SIZES[3];

  return (
    <div
      style={{
        width: size.width,
        padding: size.padding,
        borderRadius: '10px',
        background: 'rgba(30, 41, 59, 0.95)',
        border: `2px solid ${data.isRoot ? '#6366f1' : '#475569'}`,
        boxShadow: '0 8px 20px rgba(0,0,0,0.3)',
        color: '#fff',
        textAlign: 'center',
        fontSize: size.font,
      }}
    >
      <Handle type="target" position={Position.Top} style={{ background: '#6366f1' }} />

      <div style={{ fontWeight: 'bold', marginBottom: 4, lineHeight: 1.2 }}>
        {data.label}
      </div>
      <div style={{ fontSize: size.font - 2, color: '#a5b4fc', marginBottom: 8 }}>
        مستوى {data.level}
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', gap: 6, flexWrap: 'wrap' }}>
        <Link
          to={`/categories/create?parentId=${data.id}&level=${data.level}`}
          style={{
            fontSize: 10,
            background: '#2dd4bf',
            color: '#000',
            padding: '4px 8px',
            borderRadius: 5,
            textDecoration: 'none',
            fontWeight: 'bold',
          }}
        >
          + إضافة فرع
        </Link>

        <button
          type="button"
          onClick={() => data.onDelete(data.id)}
          style={{
            fontSize: 10,
            background: '#ef4444',
            color: '#fff',
            border: 0,
            padding: '4px 8px',
            borderRadius: 5,
            cursor: 'pointer',
            fontWeight: 'bold',
          }}
        >
          حذف
        </button>
      </div>

      <Handle type="source" position={Position.Bottom} style={{ background: '#6366f1' }} />
    </div>
  );
};

const nodeTypes = {
  category: CategoryNode,
};

const CategoryMapContent = ({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
}: any) => {
  const { setCategoryViewport, categoryViewport } = useDashboardStore();
  const { setViewport, fitView } = useReactFlow();

  const onMoveEnd = useCallback(
    (_event: any, viewport: any) => {
      setCategoryViewport(viewport);
    },
    [setCategoryViewport]
  );

  useEffect(() => {
    if (categoryViewport) {
      setViewport(categoryViewport);
    } else {
      // Fit the whole tree nicely when filter changes
      setTimeout(() => fitView({ padding: 0.15, duration: 300 }), 50);
    }
  }, [setViewport, categoryViewport, nodes, fitView]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onMoveEnd={onMoveEnd}
      nodeTypes={nodeTypes}
      fitView={!categoryViewport}
      fitViewOptions={{ padding: 0.15 }}
      minZoom={0.2}
      maxZoom={1.5}
    >
      <Background color="#1e293b" gap={25} />
      <Controls />
    </ReactFlow>
  );
};

/** Collect subtree IDs (BFS) */
function getSubtreeIds(categories: Category[], rootId: string): Set<string> {
  const ids = new Set<string>([rootId]);
  const queue = [rootId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    const children = categories.filter((c) => c.parent_id === current);
    for (const child of children) {
      if (!ids.has(child.id)) {
        ids.add(child.id);
        queue.push(child.id);
      }
    }
  }
  return ids;
}

/** Build children map for fast lookup */
function buildChildrenMap(categories: Category[]) {
  const map = new Map<string, Category[]>();
  for (const cat of categories) {
    if (cat.parent_id) {
      if (!map.has(cat.parent_id)) map.set(cat.parent_id, []);
      map.get(cat.parent_id)!.push(cat);
    }
  }
  return map;
}

/**
 * Hierarchical layout:
 * - Children are centered under their parent
 * - Spacing adapts to subtree width
 * - Returns Map<id, {x, y}>
 */
function computeTreeLayout(categories: Category[]): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  if (categories.length === 0) return positions;

  const childrenMap = buildChildrenMap(categories);
  const roots = categories.filter((c) => !c.parent_id || Number(c.level) === 1);

  // Horizontal gap between sibling nodes
  const H_GAP = 40;
  // Vertical gap between levels
  const V_GAP = 140;

  // Recursively measure the width a node needs (including its whole subtree)
  function measureWidth(nodeId: string): number {
    const children = childrenMap.get(nodeId) ?? [];
    const nodeWidth = NODE_SIZES[3].width; // use smallest as base unit

    if (children.length === 0) return nodeWidth + H_GAP;

    let total = 0;
    for (const child of children) {
      total += measureWidth(child.id);
    }
    return Math.max(total, nodeWidth + H_GAP);
  }

  // Recursively place nodes
  function place(nodeId: string, x: number, y: number, availableWidth: number) {
    const node = categories.find((c) => c.id === nodeId)!;
    const level = Number(node.level) as 1 | 2 | 3;
    const size = NODE_SIZES[level] ?? NODE_SIZES[3];

    // Center the node inside its available slot
    positions.set(nodeId, {
      x: x + availableWidth / 2 - size.width / 2,
      y,
    });

    const children = childrenMap.get(nodeId) ?? [];
    if (children.length === 0) return;

    // Calculate total width needed by all children
    const childWidths = children.map((c) => measureWidth(c.id));
    const totalChildrenWidth = childWidths.reduce((a, b) => a + b, 0);

    // Start x so the whole children group is centered under the parent
    let childX = x + (availableWidth - totalChildrenWidth) / 2;

    children.forEach((child, i) => {
      place(child.id, childX, y + V_GAP, childWidths[i]);
      childX += childWidths[i];
    });
  }

  // Place every top-level root (normally only one when filtered)
  let currentX = 0;
  for (const root of roots) {
    const width = measureWidth(root.id);
    place(root.id, currentX, 0, width);
    currentX += width + 80; // gap between multiple roots (if "All" is selected)
  }

  return positions;
}

export const CategoryList = () => {
  const [allCategories, setAllCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedRootId, setSelectedRootId] = useState<string | null>(null);

  const deleteCategory = async (id: string) => {
    if (!window.confirm('هل تريد حذف هذا القسم؟')) return;

    const { error: deleteError } = await supabaseClient
      .from('categories')
      .delete()
      .eq('id', id);

    if (deleteError) {
      setIsError(true);
      setError(deleteError.message);
      return;
    }

    setAllCategories((current) => current.filter((c) => c.id !== id));
  };

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // Fetch everything once
  useEffect(() => {
    async function load() {
      setIsLoading(true);
      const { data, error: fetchErr } = await supabaseClient
        .from('categories')
        .select('*');

      if (fetchErr) {
        setIsError(true);
        setError(fetchErr.message);
      } else {
        setAllCategories(data ?? []);
      }
      setIsLoading(false);
    }
    load();
  }, []);

  const topLevelParents = useMemo(
    () => allCategories.filter((c) => Number(c.level) === 1),
    [allCategories]
  );

  const visibleCategories = useMemo(() => {
    if (!selectedRootId) return allCategories;
    const subtreeIds = getSubtreeIds(allCategories, selectedRootId);
    return allCategories.filter((c) => subtreeIds.has(c.id));
  }, [allCategories, selectedRootId]);

  // Build nodes + edges with the new centered layout
  useEffect(() => {
    if (visibleCategories.length === 0) {
      setNodes([]);
      setEdges([]);
      return;
    }

    const layout = computeTreeLayout(visibleCategories);

    const initialNodes: Node[] = visibleCategories.map((cat) => {
      const pos = layout.get(cat.id) ?? { x: 0, y: 0 };
      const level = Number(cat.level);

      return {
        id: cat.id,
        type: 'category',
        data: {
          label: cat.name,
          level,
          id: cat.id,
          isRoot: level === 1,
          onDelete: deleteCategory,
        },
        position: pos,
        // Help React Flow know the real size (optional but good for fitView)
        style: {
          width: (NODE_SIZES[level as 1 | 2 | 3] ?? NODE_SIZES[3]).width,
        },
      };
    });

    const initialEdges: Edge[] = visibleCategories
      .filter((cat) => cat.parent_id)
      .map((cat) => ({
        id: `e-${cat.parent_id}-${cat.id}`,
        source: cat.parent_id!,
        target: cat.id,
        animated: true,
        style: { stroke: '#6366f1', strokeWidth: 2 },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: '#6366f1',
        },
      }));

    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [visibleCategories, setNodes, setEdges]);

  if (isError) {
    return (
      <div className="teacher-page">
        <div className="empty-state">
          <h2>خطأ في الاتصال</h2>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="teacher-page">
        <div className="empty-state">
          <p>جاري تحميل الخريطة...</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="teacher-page"
      style={{
        height: 'calc(100vh - 150px)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <header className="page-header">
        <div>
          <p className="eyebrow">التنظيم البصري</p>
          <h1>خريطة الأقسام</h1>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={() => window.location.reload()}
            className="ghost-button"
            style={{ fontSize: '12px' }}
          >
            تحديث الصفحة
          </button>
          <Link to="/categories/create" className="primary-button button-link">
            إضافة قسم رئيسي
          </Link>
        </div>
      </header>

      {/* Filter bar */}
      <div
        style={{
          padding: '12px 16px',
          background: 'rgba(255,255,255,0.05)',
          borderRadius: '10px',
          marginBottom: '12px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          flexWrap: 'wrap',
        }}
      >
        <label style={{ fontSize: '13px', fontWeight: 600 }}>
          تصفية حسب القسم الرئيسي:
        </label>

        <select
          value={selectedRootId ?? ''}
          onChange={(e) =>
            setSelectedRootId(e.target.value === '' ? null : e.target.value)
          }
          style={{
            background: '#1e293b',
            color: '#fff',
            border: '1px solid #475569',
            borderRadius: '8px',
            padding: '8px 12px',
            fontSize: '13px',
            minWidth: '220px',
            cursor: 'pointer',
          }}
        >
          <option value="">عرض الكل</option>
          {topLevelParents.map((parent) => (
            <option key={parent.id} value={parent.id}>
              {parent.name}
            </option>
          ))}
        </select>

        <span style={{ fontSize: '13px', color: '#94a3b8' }}>
          {selectedRootId
            ? `يتم عرض ${visibleCategories.length} قسم من هذا الجذر`
            : `تم تحميل ${allCategories.length} قسم`}
        </span>
      </div>

      <div
        style={{
          flex: 1,
          minHeight: '500px',
          background: '#0f172a',
          borderRadius: '20px',
          border: '3px solid #6366f1',
          overflow: 'hidden',
        }}
      >
        {visibleCategories.length > 0 ? (
          <ReactFlowProvider>
            <CategoryMapContent
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
            />
          </ReactFlowProvider>
        ) : (
          <div
            className="empty-state"
            style={{
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'column',
            }}
          >
            <h2>لا توجد بيانات بصرية</h2>
            <p>
              {selectedRootId
                ? 'لا توجد فروع تحت هذا القسم الرئيسي.'
                : 'قاعدة البيانات لم ترجع أي أقسام.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};