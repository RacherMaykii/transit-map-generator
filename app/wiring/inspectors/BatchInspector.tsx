"use client";

import { useMemo, useState } from "react";
import { computeBatchCategoryGroups } from "../batch";
import { type TemplateCategory } from "../types";
import { type InspectorProps } from "./inspectorProps";

/**
 * 框选批量设置面板：多选 ≥2 个对象时整体替代单元素 inspector。
 * 按模块模板分类（区间与车站 / 道岔与连接 / 场段和存车设施）显示分类 chips，
 * 点选分类后统一设置该分类所有模块的公共模板参数。
 */
export function BatchInspector({ ctx }: InspectorProps) {
  const { selectedIds, modules, platforms, labels, graphics, connections, templateMap, activePage, applyBatchParamUpdate } = ctx;
  const [activeCategory, setActiveCategory] = useState<TemplateCategory | null>(null);

  const selectedModuleIds = useMemo(
    () => modules
      .filter((module) => selectedIds.includes(module.id) && (module.pageId || "page-1") === activePage.id)
      .map((module) => module.id),
    [modules, selectedIds, activePage.id],
  );

  const groups = useMemo(
    () => computeBatchCategoryGroups(modules, templateMap, selectedModuleIds),
    [modules, templateMap, selectedModuleIds],
  );

  // 选中的分类消失时自动回落到首个分组。
  const effectiveGroup = (activeCategory && groups.byCategory[activeCategory]) || groups.groups[0] || null;

  const selectedSet = new Set(selectedIds);
  const selectedModSet = new Set(selectedModuleIds);
  const platformCount = platforms.filter((p) => selectedSet.has(p.id) || (p.moduleId && selectedModSet.has(p.moduleId))).length;
  const labelCount = labels.filter((l) => selectedSet.has(l.id) || (l.attachedToId && selectedModSet.has(l.attachedToId))).length;
  const graphicCount = graphics.filter((g) => selectedSet.has(g.id) || (g.attachedToId && selectedModSet.has(g.attachedToId))).length;
  const connectionCount = connections.filter((c) => selectedSet.has(c.id) || (selectedModSet.has(c.fromModuleId) && selectedModSet.has(c.toModuleId))).length;

  return (
    <>
      <p className="wiring-batch-stats">
        模块 {selectedModuleIds.length} · 站台 {platformCount} · 文字 {labelCount} · 图标 {graphicCount} · 连接 {connectionCount}
      </p>
      {selectedModuleIds.length < 2 ? (
        <p className="wiring-batch-hint">当前选择中模块不足 2 个，批量参数设置仅对模块生效。</p>
      ) : (
        <>
          <div className="wiring-batch-category-chips">
            {groups.groups.map((group) => (
              <button
                key={group.category}
                type="button"
                className={group.category === effectiveGroup?.category ? "active" : ""}
                onClick={() => setActiveCategory(group.category)}
                title={`批量设置「${group.categoryName}」的模板参数`}
              >
                {group.categoryName}
                <small>{group.moduleIds.length}</small>
              </button>
            ))}
          </div>
          {effectiveGroup && effectiveGroup.params.length > 0 && (
            <div className="wiring-prop-group">
              <h5>{effectiveGroup.categoryName} · 模板参数</h5>
              {effectiveGroup.params.map((param) => {
                const firstMod = modules.find((m) => m.id === effectiveGroup.moduleIds[0]);
                const baseParam = firstMod
                  ? templateMap.get(firstMod.templateId)?.params?.find((candidate) => candidate.key === param.key)
                  : undefined;
                const value = firstMod
                  ? (firstMod.customParams?.[param.key] ?? baseParam?.default ?? param.default)
                  : param.default;
                return (
                  <div key={param.key} className="wiring-prop-row wiring-param-slider">
                    <label>{param.label}</label>
                    <input
                      type="range"
                      min={param.min}
                      max={param.max}
                      step={param.step || 1}
                      value={value}
                      onChange={(e) => applyBatchParamUpdate(effectiveGroup.moduleIds, param.key, parseInt(e.target.value))}
                    />
                    <span className="wiring-param-value">{value}{param.unit || ""}</span>
                  </div>
                );
              })}
            </div>
          )}
          {effectiveGroup && effectiveGroup.params.length === 0 && (
            <p className="wiring-batch-hint">该分类下的模板没有可调参数。</p>
          )}
        </>
      )}
    </>
  );
}
