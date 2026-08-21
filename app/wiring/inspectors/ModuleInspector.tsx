"use client";

import { shiftOwnedPlatformZIndex } from "../canvasLogic";
import { addStationAssociation, lineIdsForStationAssociations, moveStationAssociation, removeStationAssociation } from "../stationAssociation";
import { MODULE_TEMPLATES, supportsAvoidanceTracks } from "../templates";
import { type DiagramModule } from "../types";
import { MirrorToggle } from "../ui/svgElements";
import { type InspectorProps } from "./inspectorProps";
import { lineOptionLabel, stationOptionLabel } from "../../transit/types";

export function ModuleInspector({ ctx }: InspectorProps) {
  const {
    selectedMod,
    selectedTemplate,
    isLayerLocked,
    updateModule,
    templateMap,
    advancedMode,
    layers,
    selectableLayers,
    data,
    setLabels,
    setSelectedIds,
    selectedIds,
    modules,
    platforms,
    setPlatforms,
    setModules,
    editingPlatformModuleId,
    setEditingPlatformModuleId,
    deleteSelected,
  } = ctx;

  if (!selectedMod || !selectedTemplate) return null;

  return (
    <>
      {isLayerLocked(selectedMod.layerId) && (
        <p style={{ fontSize: 11, color: "#b45309", background: "#fef3c7", border: "1px solid #f59e0b", borderRadius: 6, padding: "6px 8px", margin: "0 0 10px", lineHeight: 1.45 }}>
          该模块所在图层已锁定，此面板中的修改（含站点关联）不会生效。请在左侧图层面板解锁后再编辑。
        </p>
      )}
      <div className="wiring-prop-group">
        <h5>基本信息</h5>
        <div className="wiring-prop-row">
          <label>名称</label>
          <input type="text" value={selectedMod.name} onChange={(e) => updateModule(selectedMod.id, { name: e.target.value })} />
        </div>
        <div className="wiring-prop-row">
          <label>自定义标签</label>
          <input type="text" value={selectedMod.customLabel || ""} placeholder="覆盖站名" onChange={(e) => updateModule(selectedMod.id, { customLabel: e.target.value })} />
        </div>
        <div className="wiring-prop-row">
          <label>模板</label>
          <select value={selectedMod.templateId} onChange={(e) => {
            const newTplId = e.target.value;
            const newTemplate = templateMap.get(newTplId);
            const patch: Partial<DiagramModule> = { templateId: newTplId };
            if (newTemplate?.params?.length) {
              patch.customParams = Object.fromEntries(newTemplate.params.map(p => [p.key, p.default]));
            } else {
              patch.customParams = undefined;
            }
            if (!newTemplate || !supportsAvoidanceTracks(newTemplate.id)) patch.avoidanceTracks = undefined;
            updateModule(selectedMod.id, patch);
          }}>
            {MODULE_TEMPLATES.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
      </div>

      {supportsAvoidanceTracks(selectedTemplate.id) && (
        <div className="wiring-prop-group">
          <h5>站台与股道</h5>
          <label className="wiring-check" title="避让线在当前站点元件内部从正线分出并接回，不会增加对外连接点">
            <input
              type="checkbox"
              checked={selectedMod.avoidanceTracks === true}
              onChange={(event) => updateModule(
                selectedMod.id,
                { avoidanceTracks: event.target.checked },
                event.target.checked ? "启用避让线" : "关闭避让线",
              )}
            />
            显示避让线
          </label>
          <p style={{ fontSize: 10, color: "var(--muted)", margin: "6px 0 0" }}>
            岛式位于正线外侧，侧式位于两条正线之间；同台换乘同时显示外侧与中央避让线。
          </p>
        </div>
      )}

      <div className="wiring-prop-group">
        <h5>位置与变换</h5>
        <div className="wiring-prop-row">
          <label>X 坐标</label>
          <input type="number" value={selectedMod.x} onChange={(e) => updateModule(selectedMod.id, { x: parseInt(e.target.value) || 0 })} />
        </div>
        <div className="wiring-prop-row">
          <label>Y 坐标</label>
          <input type="number" value={selectedMod.y} onChange={(e) => updateModule(selectedMod.id, { y: parseInt(e.target.value) || 0 })} />
        </div>
        <div className="wiring-prop-row wiring-module-direction">
          <label>方向</label>
          <div className="wiring-direction-control" aria-label="模块旋转方向">
            <div className="wiring-rotation-grid">
              {(advancedMode ? [
                { rotation: 225, icon: "↖", label: "左上 225°", position: "top-left" },
                { rotation: 270, icon: "↑", label: "向上 270°", position: "top" },
                { rotation: 315, icon: "↗", label: "右上 315°", position: "top-right" },
                { rotation: 180, icon: "←", label: "向左 180°", position: "left" },
                { rotation: 0, icon: "·", label: "恢复默认 0°", position: "center", reset: true },
                { rotation: 0, icon: "→", label: "向右 0°", position: "right" },
                { rotation: 135, icon: "↙", label: "左下 135°", position: "bottom-left" },
                { rotation: 90, icon: "↓", label: "向下 90°", position: "bottom" },
                { rotation: 45, icon: "↘", label: "右下 45°", position: "bottom-right" },
              ] : [
                { rotation: 270, icon: "↑", label: "向上 270°", position: "top" },
                { rotation: 180, icon: "←", label: "向左 180°", position: "left" },
                { rotation: 0, icon: "→", label: "向右 0°", position: "right" },
                { rotation: 90, icon: "↓", label: "向下 90°", position: "bottom" },
              ]).map((option) => (
                <button
                  key={option.position}
                  type="button"
                  className={`${option.position} ${!option.reset && selectedMod.rotation === option.rotation ? "active" : ""}`}
                  onClick={() => updateModule(selectedMod.id, { rotation: option.rotation }, "旋转模块")}
                  title={option.label}
                  aria-label={option.label}
                >
                  {option.icon}
                </button>
              ))}
              {!advancedMode && <span className="wiring-direction-center" aria-hidden="true">·</span>}
            </div>
            <span>{selectedMod.rotation}°</span>
          </div>
        </div>
        <div className="wiring-prop-row">
          <label>镜像</label>
          <MirrorToggle mirrorX={selectedMod.mirrorX} mirrorY={selectedMod.mirrorY} onChange={(next) => updateModule(selectedMod.id, next, "镜像模块")} />
        </div>
        <div className="wiring-prop-row">
          <label>层级</label>
          <select value={selectedMod.layerId} onChange={(e) => updateModule(selectedMod.id, { layerId: e.target.value })}>
            {layers.filter((l) => selectableLayers.includes(l.id)).map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </div>
        {advancedMode && (
          <div className="wiring-prop-row">
            <label>Z-Index</label>
            <input type="number" value={selectedMod.zIndex} onChange={(e) => updateModule(selectedMod.id, { zIndex: parseInt(e.target.value) || 0 })} />
          </div>
        )}
        {selectedTemplate.labels.some((label) => (label.fontSize || 13) <= 9) && (
          <label className="wiring-check" title="只影响本组件的左开、右开、折返等辅助小字">
            <input type="checkbox" checked={selectedMod.showAuxLabels !== false} onChange={(e) => updateModule(selectedMod.id, { showAuxLabels: e.target.checked })} />显示辅助标识
          </label>
        )}
      </div>

      {selectedTemplate.params && selectedTemplate.params.length > 0 && (
        <div className="wiring-prop-group">
          <h5>模板参数</h5>
          {selectedTemplate.params.map((param) => {
            const value = selectedMod.customParams?.[param.key] ?? param.default;
            if (param.kind === "boolean") {
              return (
                <label key={param.key} className="wiring-check wiring-param-toggle">
                  <span>{param.label}<small>开启后延长斜轨，使同组输出端点平齐。</small></span>
                  <input
                    type="checkbox"
                    checked={value === 1}
                    onChange={(event) => updateModule(selectedMod.id, {
                      customParams: { ...(selectedMod.customParams || {}), [param.key]: event.target.checked ? 1 : 0 },
                    }, event.target.checked ? "开启端点补齐" : "关闭端点补齐")}
                  />
                </label>
              );
            }
            return (
              <div key={param.key} className="wiring-prop-row wiring-param-slider">
                <label>{param.label}</label>
                <input
                  type="range"
                  min={param.min}
                  max={param.max}
                  step={param.step || 1}
                  value={value}
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    updateModule(selectedMod.id, {
                      customParams: { ...(selectedMod.customParams || {}), [param.key]: val },
                    });
                  }}
                />
                <span className="wiring-param-value">{value}{param.unit || ""}</span>
              </div>
            );
          })}
        </div>
      )}

      <div className="wiring-prop-group">
        <h5>线路关联</h5>
        <div className="wiring-line-picker">
          {data.lines.map((line) => {
            const checked = selectedMod.lineIds.includes(line.id);
            return (
              <label key={line.id} className="wiring-line-option" title={lineOptionLabel(line)}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => updateModule(
                    selectedMod.id,
                    { lineIds: checked ? selectedMod.lineIds.filter((id) => id !== line.id) : [...selectedMod.lineIds, line.id] },
                    checked ? "取消关联线路" : "关联线路",
                  )}
                />
                <span className="wiring-line-swatch" style={{ background: line.lineColor || "#202124" }} />
                <span className="wiring-line-name">{lineOptionLabel(line)}</span>
              </label>
            );
          })}
          {!data.lines.length && <p style={{ fontSize: 11, color: "var(--muted)", margin: "4px 0" }}>暂无线路数据</p>}
        </div>
      </div>

      <div className="wiring-prop-group">
        <h5>元件轨道颜色</h5>
        <div className="wiring-prop-row" style={{ gridTemplateColumns: "1fr" }}>
          <div className="wiring-crossing-buttons">
            <button
              className={`wiring-btn ${selectedMod.trackColorMode === "default" ? "active" : ""}`}
              onClick={() => updateModule(selectedMod.id, { trackColorMode: "default" }, "设置默认轨道颜色")}
            >
              深灰
            </button>
            <button
              className={`wiring-btn ${(selectedMod.trackColorMode ?? "line") === "line" ? "active" : ""}`}
              onClick={() => updateModule(selectedMod.id, { trackColorMode: "line" }, "设置跟随线路颜色")}
            >
              跟随线路
            </button>
            <button
              className={`wiring-btn ${selectedMod.trackColorMode === "manual" ? "active" : ""}`}
              onClick={() => updateModule(selectedMod.id, { trackColorMode: "manual" }, "设置手动轨道颜色")}
            >
              手动
            </button>
          </div>
        </div>
        {selectedMod.trackColorMode === "manual" && (
          <div className="wiring-prop-row">
            <label>颜色</label>
            <div className="wiring-prop-color">
              <input type="color" value={selectedMod.trackColor || "#202124"} onChange={(e) => updateModule(selectedMod.id, { trackColor: e.target.value }, "设置轨道颜色")} />
              <input type="text" value={selectedMod.trackColor || "#202124"} onChange={(e) => updateModule(selectedMod.id, { trackColor: e.target.value }, "设置轨道颜色")} />
            </div>
          </div>
        )}
        <p style={{ fontSize: 10, color: "var(--muted)", margin: "4px 0 0" }}>
          {selectedMod.trackColorMode === "default" && "使用固定深灰轨道（不跟随线路）"}
          {(selectedMod.trackColorMode ?? "line") === "line" && "根据模块关联的线路颜色自动填充；站台、道岔和场段元件均适用，多条线路时按轨道位置分配颜色"}
          {selectedMod.trackColorMode === "manual" && "使用手动指定的颜色"}
        </p>
      </div>

      <div className="wiring-prop-group">
        <h5>站名颜色</h5>
        <div className="wiring-prop-row" style={{ gridTemplateColumns: "1fr" }}>
          <div className="wiring-crossing-buttons">
            <button
              className={`wiring-btn ${selectedMod.labelColorMode === "default" ? "active" : ""}`}
              onClick={() => updateModule(selectedMod.id, { labelColorMode: "default" }, "设置默认站名颜色")}
            >
              深灰
            </button>
            <button
              className={`wiring-btn ${(selectedMod.labelColorMode ?? "line") === "line" ? "active" : ""}`}
              onClick={() => updateModule(selectedMod.id, { labelColorMode: "line" }, "设置站名跟随线路颜色")}
            >
              跟随线路
            </button>
          </div>
        </div>
        <p style={{ fontSize: 10, color: "var(--muted)", margin: "4px 0 0" }}>
          {selectedMod.labelColorMode === "default" && "使用固定深灰站名（不跟随线路）"}
          {(selectedMod.labelColorMode ?? "line") === "line" && "根据模块关联的线路颜色自动着色；多条线路时按站名位置取色"}
        </p>
      </div>

      <div className="wiring-prop-group">
        <h5>站点关联</h5>
        <div className="wiring-prop-row" style={{ gridTemplateColumns: "1fr" }}>
          <select
            value=""
            disabled={isLayerLocked(selectedMod.layerId)}
            onChange={(e) => {
              const stationId = e.target.value;
              if (!stationId) return;
              const nextStationIds = addStationAssociation(selectedMod.sourceStationIds, stationId);
              const primaryStation = data.stations.find((station) => station.id === nextStationIds[0]);
              updateModule(selectedMod.id, {
                sourceStationIds: nextStationIds,
                lineIds: lineIdsForStationAssociations(nextStationIds, data.stations),
              }, "添加关联站点");
              // 第一条记录决定站名，其余记录只提供换乘线路与颜色。
              if (primaryStation) {
                setLabels((prev) => prev.map((label) =>
                  label.attachedToId === selectedMod.id
                    ? { ...label, text: label.language === "en" ? (primaryStation.nameEn || label.text) : (primaryStation.nameZh || label.text), sourceStationId: primaryStation.id }
                    : label,
                ));
              }
            }}
          >
            <option value="">添加关联站点…</option>
            {data.stations.filter((station) => !selectedMod.sourceStationIds.includes(station.id)).map((station) => {
              const stationLine = data.lines.find((line) => line.id === station.lineId);
              return <option key={station.id} value={station.id}>{stationOptionLabel(station, stationLine)}</option>;
            })}
          </select>
        </div>
        <div className="wiring-station-associations">
          {selectedMod.sourceStationIds.length === 0 && <span className="wiring-association-empty">尚未关联站点</span>}
          {selectedMod.sourceStationIds.map((stationId, index) => {
            const station = data.stations.find((candidate) => candidate.id === stationId);
            const line = station ? data.lines.find((candidate) => candidate.id === station.lineId) : undefined;
            const moveAssociation = (offset: -1 | 1) => {
              const nextStationIds = moveStationAssociation(selectedMod.sourceStationIds, stationId, offset);
              if (nextStationIds === selectedMod.sourceStationIds) return;
              const primaryStation = data.stations.find((candidate) => candidate.id === nextStationIds[0]);
              updateModule(selectedMod.id, {
                sourceStationIds: nextStationIds,
                lineIds: lineIdsForStationAssociations(nextStationIds, data.stations),
              }, "调整站台配色顺序");
              if (primaryStation) {
                setLabels((prev) => prev.map((label) => label.attachedToId === selectedMod.id
                  ? { ...label, text: label.language === "en" ? (primaryStation.nameEn || label.text) : primaryStation.nameZh, sourceStationId: primaryStation.id }
                  : label));
              }
            };
            return <div className="wiring-station-association" key={stationId}>
              <span className="wiring-association-swatch" style={{ background: line?.lineColor || "#98a2b3" }} />
              <span><b>{index + 1}. {station?.nameZh || stationId}</b><small>{line?.nameZh || station?.lineId || "源数据已删除"}{index === 0 ? " · 主站名/第一配色" : ` · 第 ${index + 1} 配色`}</small></span>
              <span className="wiring-association-order-actions">
                <button type="button" aria-label={`上移 ${station?.nameZh || stationId}`} title="上移配色顺序" disabled={index === 0 || isLayerLocked(selectedMod.layerId)} onClick={() => moveAssociation(-1)}>↑</button>
                <button type="button" aria-label={`下移 ${station?.nameZh || stationId}`} title="下移配色顺序" disabled={index === selectedMod.sourceStationIds.length - 1 || isLayerLocked(selectedMod.layerId)} onClick={() => moveAssociation(1)}>↓</button>
              </span>
              <button className="wiring-association-remove"
                type="button"
                aria-label={`移除 ${station?.nameZh || stationId}`}
                disabled={isLayerLocked(selectedMod.layerId)}
                onClick={() => {
                  const nextStationIds = removeStationAssociation(selectedMod.sourceStationIds, stationId);
                  const primaryStation = data.stations.find((candidate) => candidate.id === nextStationIds[0]);
                  updateModule(selectedMod.id, {
                    sourceStationIds: nextStationIds,
                    lineIds: lineIdsForStationAssociations(nextStationIds, data.stations),
                  }, "移除关联站点");
                  if (primaryStation) {
                    setLabels((prev) => prev.map((label) => label.attachedToId === selectedMod.id
                      ? { ...label, text: label.language === "en" ? (primaryStation.nameEn || label.text) : primaryStation.nameZh, sourceStationId: primaryStation.id }
                      : label));
                  }
                }}
              >×</button>
            </div>;
          })}
        </div>
        <p style={{ fontSize: 10, color: "var(--muted)", margin: "6px 0 0", lineHeight: 1.5 }}>任意站台均可关联多条线路；列表顺序会随工程保存，并决定线路与站台的配色顺序。第一项同时决定显示站名。</p>
        {selectedMod.sourceStationIds.some((stationId) => !data.stations.some((station) => station.id === stationId)) && <p className="wiring-source-deleted">源数据已删除。可以重新绑定、保留为自定义对象或删除模块。</p>}
      </div>

      <div className="wiring-prop-actions">
        <button onClick={() => updateModule(selectedMod.id, { locked: !selectedMod.locked })}>
          {selectedMod.locked ? "🔓 解锁模块" : "🔒 锁定模块"}
        </button>
        <button onClick={() => {
          const next = selectedIds.length > 1 ? selectedIds : [selectedMod.id];
          const topZ = modules.length;
          // 所属站台 zIndex 不随模块自动变化，这里把增量同步过去（站台才能提到连接线之上）
          let nextPlatforms = platforms;
          for (const modId of next) {
            const mod = modules.find((m) => m.id === modId);
            if (!mod || mod.zIndex === topZ) continue;
            nextPlatforms = shiftOwnedPlatformZIndex(nextPlatforms, modId, topZ - mod.zIndex);
          }
          if (nextPlatforms !== platforms) setPlatforms(nextPlatforms);
          setModules((prev) => prev.map((m) => next.includes(m.id) ? { ...m, zIndex: prev.length } : m));
        }}>⬆ 置于顶层</button>
        {selectedTemplate?.platforms.length ? (editingPlatformModuleId === selectedMod.id ? <button onClick={() => { setEditingPlatformModuleId(null); setSelectedIds([selectedMod.id]); }} style={{ background: "var(--accent)", color: "#fff" }}>✅ 完成编辑</button> : <button onClick={() => setEditingPlatformModuleId(selectedMod.id)}>✏️ 编辑站台</button>) : null}
        <button className="danger" onClick={deleteSelected}>🗑 删除模块</button>
      </div>
    </>
  );
}
