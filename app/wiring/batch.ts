// ──────────────────────────────────────────────
// 配线图编辑器 · 框选批量参数设置（纯函数）
// 供右侧「批量设置」面板使用；不依赖 React。
// ──────────────────────────────────────────────

import { type DiagramModule, type ModuleTemplate, type TemplateCategory, type TemplateParam } from "./types";

/** 同一分类下被选中模块的聚合组：公共参数并集 + 模块 id 列表 */
export interface BatchCategoryGroup {
  category: TemplateCategory;
  /** 取自该组首个模板的 categoryName（如「区间与车站」） */
  categoryName: string;
  moduleIds: string[];
  /** 该类模块 params 的并集（按 key 去重，先到先得） */
  params: TemplateParam[];
}

export interface BatchCategoryGroups {
  /** 按首次出现顺序排列的非空分组 */
  groups: BatchCategoryGroup[];
  /** 分类 → 分组快速查找 */
  byCategory: Partial<Record<TemplateCategory, BatchCategoryGroup>>;
}

/**
 * 将选中的模块按模板分类分组，并聚合各组的公共参数并集。
 * 未命中模板（templateId 缺失或未知）的 id 会被跳过。
 */
export function computeBatchCategoryGroups(
  modules: DiagramModule[],
  templateMap: Map<string, ModuleTemplate>,
  moduleIds: string[],
): BatchCategoryGroups {
  const byCategory: Partial<Record<TemplateCategory, BatchCategoryGroup>> = {};
  const order: TemplateCategory[] = [];
  for (const id of moduleIds) {
    const mod = modules.find((candidate) => candidate.id === id);
    if (!mod) continue;
    const template = templateMap.get(mod.templateId);
    if (!template) continue;
    let group = byCategory[template.category];
    if (!group) {
      group = { category: template.category, categoryName: template.categoryName, moduleIds: [], params: [] };
      byCategory[template.category] = group;
      order.push(template.category);
    }
    group.moduleIds.push(id);
    if (template.params?.length) {
      const keys = new Set(group.params.map((param) => param.key));
      for (const param of template.params) {
        if (!keys.has(param.key)) {
          group.params.push(param);
          keys.add(param.key);
        }
      }
    }
  }
  const groups = order
    .map((category) => byCategory[category]!)
    .filter((group) => group.moduleIds.length > 0);
  return { groups, byCategory };
}

/**
 * 批量设置参数：仅替换 base 模板声明了该 key 且当前值不同的模块引用。
 * 值无变化时返回原数组（便于上层判断是否产生了实际改动）；不修改入参。
 */
export function applyBatchParam(
  modules: DiagramModule[],
  templateMap: Map<string, ModuleTemplate>,
  moduleIds: string[],
  key: string,
  value: number,
): DiagramModule[] {
  const target = new Set(moduleIds);
  let changed = false;
  const next = modules.map((mod) => {
    if (!target.has(mod.id)) return mod;
    const template = templateMap.get(mod.templateId);
    if (!template?.params?.some((param) => param.key === key)) return mod;
    if (mod.customParams?.[key] === value) return mod;
    changed = true;
    return { ...mod, customParams: { ...(mod.customParams || {}), [key]: value } };
  });
  return changed ? next : modules;
}
