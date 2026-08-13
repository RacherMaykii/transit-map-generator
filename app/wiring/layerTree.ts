// 配线图编辑器的纯树形图层辅助函数。
// 从 types.ts 拆出（原 674–1035 工具带的一部分）；types.ts 末尾 barrel re-export，
// 因此既有 `from "./types"` 导入零改动。不依赖组件状态。

import type { LayerNode } from "./types";

// ── 树形图层辅助函数 ──────────────────────────────

/** 获取某图层的所有祖先 ID（从直接父到根） */
export function getAncestorIds(layers: LayerNode[], layerId: string): string[] {
  const ids: string[] = [];
  let current = layers.find((l) => l.id === layerId);
  while (current?.parentId) {
    ids.push(current.parentId);
    current = layers.find((l) => l.id === current!.parentId);
  }
  return ids;
}

/** 图层是否真正可见（自身可见 + 所有祖先可见） */
export function isLayerTreeVisible(layers: LayerNode[], layerId: string): boolean {
  const layer = layers.find((l) => l.id === layerId);
  if (!layer) return true;
  if (!layer.visible || layer.opacity <= 0) return false;
  return getAncestorIds(layers, layerId).every((pid) => {
    const parent = layers.find((l) => l.id === pid);
    return parent ? parent.visible && parent.opacity > 0 : true;
  });
}

/** 图层是否真正锁定（自身锁定或任一祖先锁定） */
export function isLayerTreeLocked(layers: LayerNode[], layerId: string): boolean {
  const layer = layers.find((l) => l.id === layerId);
  if (!layer) return false;
  if (layer.locked) return true;
  return getAncestorIds(layers, layerId).some((pid) => {
    const parent = layers.find((l) => l.id === pid);
    return parent ? parent.locked : false;
  });
}

/** 获取某父节点的直接子图层（按 order 排序） */
export function getChildLayers(layers: LayerNode[], parentId: string): LayerNode[] {
  return layers
    .filter((l) => l.parentId === parentId)
    .sort((a, b) => a.order - b.order);
}

/** 获取根图层（parentId 为 null，按 order 排序） */
export function getRootLayers(layers: LayerNode[]): LayerNode[] {
  return layers
    .filter((l) => l.parentId === null)
    .sort((a, b) => a.order - b.order);
}

/** 判断图层是否有子图层 */
export function hasChildren(layers: LayerNode[], layerId: string): boolean {
  return layers.some((l) => l.parentId === layerId);
}

/** 将扁平图层数组按树序展开为渲染顺序（深度优先，父在前） */
export function flattenLayerTree(layers: LayerNode[]): LayerNode[] {
  const result: LayerNode[] = [];
  function walk(parentId: string | null) {
    const children = layers
      .filter((l) => l.parentId === parentId)
      .sort((a, b) => a.order - b.order);
    for (const child of children) {
      result.push(child);
      walk(child.id);
    }
  }
  walk(null);
  return result;
}
