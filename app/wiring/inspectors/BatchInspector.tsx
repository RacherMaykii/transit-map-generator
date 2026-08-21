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
  const {
    selectedIds,
    modules,
    platforms,
    labels,
    graphics,
    connections,
    templateMap,
    activePage,
    applyBatchParamUpdate,
    isLayerLocked,
    setSelectedIds,
    deleteSelected,
  } = ctx;
  const [activeCategory, setActiveCategory] = useState<TemplateCategory | null>(null);
  const [draftValues, setDraftValues] = useState<Record<string, number>>({});

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
  const nonModuleObjectCount = Math.max(0, selectedIds.length - selectedModuleIds.length);

  const setDraftValue = (key: string, value: number) => {
    setDraftValues((previous) => ({ ...previous, [key]: value }));
  };

  const clearDraftValue = (key: string) => {
    setDraftValues((previous) => {
      if (!(key in previous)) return previous;
      const next = { ...previous };
      delete next[key];
      return next;
    });
  };

  return (
    <div className="wiring-batch-panel">
      <section className="wiring-batch-summary" aria-label="选择内容统计">
        <div><b>{selectedIds.length}</b><span>已选对象</span></div>
        <ul>
          <li><b>{selectedModuleIds.length}</b> 模块</li>
          <li><b>{platformCount}</b> 站台</li>
          <li><b>{labelCount}</b> 文字</li>
          <li><b>{graphicCount}</b> 图形</li>
          <li><b>{connectionCount}</b> 连接</li>
        </ul>
      </section>

      {selectedModuleIds.length < 2 ? (
        <div className="wiring-batch-empty">
          <span aria-hidden="true">i</span>
          <div><b>没有可批量调整的模块</b><p>模板参数至少需要选择两个站点、区间、道岔或场段模块。</p></div>
        </div>
      ) : (
        <>
          <section className="wiring-batch-scope">
            <header><div><b>作用范围</b><span>先选择模块类别，再统一修改该类的公共参数。</span></div></header>
            <div className="wiring-batch-category-chips">
              {groups.groups.map((group) => (
                <button
                  key={group.category}
                  type="button"
                  className={group.category === effectiveGroup?.category ? "active" : ""}
                  onClick={() => setActiveCategory(group.category)}
                  title={`批量设置「${group.categoryName}」的模板参数`}
                >
                  <span>{group.categoryName}</span>
                  <small>{group.moduleIds.length}</small>
                </button>
              ))}
            </div>
          </section>

          {nonModuleObjectCount > 0 && (
            <p className="wiring-batch-object-note">
              另有 {nonModuleObjectCount} 个非模块对象仅参与移动、复制和删除，不会被下方模板参数修改。
            </p>
          )}

          {effectiveGroup && effectiveGroup.params.length > 0 && (
            <section className="wiring-batch-parameters">
              <header><div><b>公共模板参数</b><span>拖动时查看数值，松开后作为一个撤销步骤应用。</span></div><em>{effectiveGroup.moduleIds.length} 个模块</em></header>
              {effectiveGroup.params.map((param) => {
                const applicableModules = effectiveGroup.moduleIds
                  .map((id) => modules.find((module) => module.id === id))
                  .filter((module) => module && templateMap.get(module.templateId)?.params?.some((candidate) => candidate.key === param.key));
                const unlockedModules = applicableModules.filter((module) => module && !isLayerLocked(module.layerId));
                const values = applicableModules.map((module) => {
                  const baseParam = templateMap.get(module!.templateId)?.params?.find((candidate) => candidate.key === param.key);
                  return module!.customParams?.[param.key] ?? baseParam?.default ?? param.default;
                });
                const uniqueValues = [...new Set(values)];
                const isMixed = uniqueValues.length > 1;
                const draftKey = `${effectiveGroup.category}:${param.key}`;
                const draftValue = draftValues[draftKey];
                const value = draftValue ?? uniqueValues[0] ?? param.default;
                const clampedValue = Math.max(param.min, Math.min(param.max, value));
                const commit = (nextValue: number) => {
                  const fallbackValue = uniqueValues[0] ?? param.default;
                  const finiteValue = Number.isFinite(nextValue) ? nextValue : fallbackValue;
                  const normalized = Math.max(param.min, Math.min(param.max, Math.round(finiteValue / (param.step || 1)) * (param.step || 1)));
                  applyBatchParamUpdate(effectiveGroup.moduleIds, param.key, normalized);
                  clearDraftValue(draftKey);
                };
                if (param.kind === "boolean") {
                  return (
                    <div key={param.key} className="wiring-batch-param-row">
                      <div className="wiring-batch-param-heading">
                        <label htmlFor={`batch-${effectiveGroup.category}-${param.key}`}>{param.label}</label>
                        <span>{isMixed ? "多值" : clampedValue === 1 ? "已开启" : "已关闭"}</span>
                      </div>
                      <select
                        id={`batch-${effectiveGroup.category}-${param.key}`}
                        className="wiring-batch-param-select"
                        value={isMixed ? "" : clampedValue === 1 ? "1" : "0"}
                        disabled={unlockedModules.length === 0}
                        onChange={(event) => commit(Number(event.target.value))}
                      >
                        {isMixed && <option value="" disabled>保持各自设置</option>}
                        <option value="1">补齐到平齐端点</option>
                        <option value="0">保留自然端点</option>
                      </select>
                      <small>应用于 {unlockedModules.length} 个模块</small>
                    </div>
                  );
                }
                return (
                  <div key={param.key} className="wiring-batch-param-row">
                    <div className="wiring-batch-param-heading">
                      <label htmlFor={`batch-${effectiveGroup.category}-${param.key}`}>{param.label}</label>
                      <span>{isMixed && draftValue === undefined ? "多值" : `${clampedValue}${param.unit || ""}`}</span>
                    </div>
                    <div className="wiring-batch-param-control">
                      <input
                        id={`batch-${effectiveGroup.category}-${param.key}`}
                        type="range"
                        min={param.min}
                        max={param.max}
                        step={param.step || 1}
                        value={clampedValue}
                        disabled={unlockedModules.length === 0}
                        onChange={(event) => setDraftValue(draftKey, Number(event.target.value))}
                        onPointerUp={(event) => commit(Number(event.currentTarget.value))}
                        onKeyUp={(event) => {
                          if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"].includes(event.key)) commit(Number(event.currentTarget.value));
                        }}
                      />
                      <input
                        className="wiring-batch-param-number"
                        type="number"
                        min={param.min}
                        max={param.max}
                        step={param.step || 1}
                        value={clampedValue}
                        disabled={unlockedModules.length === 0}
                        aria-label={`${param.label}数值`}
                        onChange={(event) => setDraftValue(draftKey, Number(event.target.value))}
                        onBlur={(event) => commit(Number(event.currentTarget.value))}
                        onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
                      />
                    </div>
                    <small>
                      应用于 {unlockedModules.length} 个模块
                      {applicableModules.length > unlockedModules.length ? ` · ${applicableModules.length - unlockedModules.length} 个已锁定` : ""}
                    </small>
                  </div>
                );
              })}
            </section>
          )}
          {effectiveGroup && effectiveGroup.params.length === 0 && (
            <div className="wiring-batch-empty compact"><span aria-hidden="true">—</span><div><b>没有公共模板参数</b><p>该类别仍可整体移动、复制或删除。</p></div></div>
          )}
        </>
      )}

      <section className="wiring-batch-actions">
        <button type="button" className="wiring-btn" onClick={() => setSelectedIds([])}>取消选择</button>
        <button type="button" className="wiring-btn danger" onClick={deleteSelected}>删除所选</button>
      </section>
    </div>
  );
}
