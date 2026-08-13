"use client";

import { type InspectorProps } from "./inspectorProps";

export function TransferGroupInspector({ ctx }: InspectorProps) {
  const {
    selectedTransferGroup,
    updateTransferGroup,
    modules,
    removeModuleFromGroup,
    addSelectedModulesToGroup,
    selectedIds,
    data,
    layers,
    selectableLayers,
    deleteTransferGroup,
  } = ctx;

  if (!selectedTransferGroup) return null;

  return (
    <>
      <div className="wiring-prop-group">
        <h5>换乘组属性</h5>
        <div className="wiring-prop-row">
          <label>名称</label>
          <input type="text" value={selectedTransferGroup.name} onChange={(e) => updateTransferGroup(selectedTransferGroup.id, { name: e.target.value }, "修改换乘组名称")} />
        </div>
      </div>

      <div className="wiring-prop-group">
        <h5>成员模块（{selectedTransferGroup.moduleIds.length}）</h5>
        {selectedTransferGroup.moduleIds.length === 0 ? (
          <p style={{ fontSize: 11, color: "var(--muted)", margin: "4px 0" }}>暂无成员模块</p>
        ) : (
          <div className="wiring-crossing-list">
            {selectedTransferGroup.moduleIds.map((modId) => {
              const mod = modules.find((m) => m.id === modId);
              return (
                <div key={modId} className="wiring-crossing-row">
                  <span>{mod?.name || "已删除模块"}</span>
                  <button className="wiring-btn icon-only danger" onClick={() => removeModuleFromGroup(selectedTransferGroup.id, modId)} title="移除">✕</button>
                </div>
              );
            })}
          </div>
        )}
        <button className="wiring-btn" style={{ width: "100%", marginTop: 6 }} onClick={() => addSelectedModulesToGroup(selectedTransferGroup.id)} disabled={!selectedIds.some((id) => modules.some((m) => m.id === id && !selectedTransferGroup.moduleIds.includes(m.id)))}>
          添加选中模块到换乘组
        </button>
      </div>

      <div className="wiring-prop-group">
        <h5>关联线路（{selectedTransferGroup.lineIds.length}）</h5>
        <div className="wiring-line-badge-list">
          {selectedTransferGroup.lineIds.map((lineId) => {
            const line = data.lines.find((l) => l.id === lineId);
            return (
              <span key={lineId} className="wiring-line-badge" style={{ borderColor: line?.lineColor || "#999" }}>
                <i style={{ background: line?.lineColor || "#999" }} />
                {lineId} {line?.nameZh || ""}
              </span>
            );
          })}
        </div>
      </div>

      <div className="wiring-prop-group">
        <h5>显示</h5>
        <div className="wiring-prop-row">
          <label>强调色</label>
          <div className="wiring-prop-color">
            <input type="color" value={selectedTransferGroup.accentColor || "#087FA4"} onChange={(e) => updateTransferGroup(selectedTransferGroup.id, { accentColor: e.target.value }, "修改换乘组强调色")} />
            <input type="text" value={selectedTransferGroup.accentColor || ""} placeholder="默认" onChange={(e) => updateTransferGroup(selectedTransferGroup.id, { accentColor: e.target.value }, "修改换乘组强调色")} />
          </div>
        </div>
        <div className="wiring-prop-row">
          <label>图层</label>
          <select value={selectedTransferGroup.layerId} onChange={(e) => updateTransferGroup(selectedTransferGroup.id, { layerId: e.target.value }, "修改换乘组图层")}>
            {layers.filter((l) => selectableLayers.includes(l.id)).map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </div>
        <div className="wiring-prop-row">
          <label>zIndex</label>
          <input type="number" value={selectedTransferGroup.zIndex} onChange={(e) => updateTransferGroup(selectedTransferGroup.id, { zIndex: parseInt(e.target.value) || 0 }, "修改换乘组层级")} />
        </div>
      </div>

      <div className="wiring-prop-actions">
        <button onClick={() => updateTransferGroup(selectedTransferGroup.id, { locked: !selectedTransferGroup.locked })}>
          {selectedTransferGroup.locked ? "🔓 解锁换乘组" : "🔒 锁定换乘组"}
        </button>
        <button onClick={() => updateTransferGroup(selectedTransferGroup.id, { visible: !selectedTransferGroup.visible })}>
          {selectedTransferGroup.visible ? "🙈 隐藏换乘组" : "👁 显示换乘组"}
        </button>
        <button className="danger" onClick={() => { deleteTransferGroup(selectedTransferGroup.id); }}>🗑 删除换乘组</button>
      </div>
    </>
  );
}
