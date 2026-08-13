"use client";

import { effectivePlatformZIndex } from "../canvasLogic";
import { type PlatformObject } from "../types";
import { type InspectorProps } from "./inspectorProps";

export function PlatformInspector({ ctx }: InspectorProps) {
  const {
    selectedPlatform,
    updatePlatform,
    layers,
    selectableLayers,
    platforms,
    modules,
    deletePlatform,
  } = ctx;

  if (!selectedPlatform) return null;

  return (
    <>
      <div className="wiring-prop-group">
        <h5>颜色模式</h5>
        <div className="wiring-prop-row" style={{ gridTemplateColumns: "1fr" }}>
          <div className="wiring-crossing-buttons">
            <button
              className={`wiring-btn ${selectedPlatform.colorMode === "default" ? "active" : ""}`}
              onClick={() => updatePlatform(selectedPlatform.id, { colorMode: "default" }, "设置默认站台颜色")}
            >
              深灰
            </button>
            <button
              className={`wiring-btn ${(selectedPlatform.colorMode ?? "line") === "line" ? "active" : ""}`}
              onClick={() => updatePlatform(selectedPlatform.id, { colorMode: "line" }, "设置跟随线路颜色")}
            >
              跟随线路
            </button>
          </div>
        </div>
        <p style={{ fontSize: 10, color: "var(--muted)", margin: "4px 0 0" }}>
          {selectedPlatform.colorMode === "default" && "使用下方手动指定的填充色"}
          {(selectedPlatform.colorMode ?? "line") === "line" && "根据所属模块的线路颜色自动填充；多条线路时自上而下显示渐变色"}
        </p>
      </div>

      <div className="wiring-prop-group">
        <h5>站台几何</h5>
        <div className="wiring-prop-row"><label>类型</label><select value={selectedPlatform.platformType} onChange={(e) => updatePlatform(selectedPlatform.id, { platformType: e.target.value as PlatformObject["platformType"] })}><option value="side">侧式</option><option value="island">岛式</option><option value="double_island">双岛</option><option value="spanish">西班牙式</option></select></div>
        <div className="wiring-prop-row"><label>X</label><input type="number" value={Math.round(selectedPlatform.x)} onChange={(e) => updatePlatform(selectedPlatform.id, { x: Number(e.target.value) })} /></div>
        <div className="wiring-prop-row"><label>Y</label><input type="number" value={Math.round(selectedPlatform.y)} onChange={(e) => updatePlatform(selectedPlatform.id, { y: Number(e.target.value) })} /></div>
        <div className="wiring-prop-row"><label>长度</label><input type="number" min={10} value={selectedPlatform.width} onChange={(e) => updatePlatform(selectedPlatform.id, { width: Math.max(10, Number(e.target.value)) })} /></div>
        <div className="wiring-prop-row"><label>厚度</label><input type="number" min={4} value={selectedPlatform.height} onChange={(e) => updatePlatform(selectedPlatform.id, { height: Math.max(4, Number(e.target.value)) })} /></div>
        <div className="wiring-prop-row"><label>旋转</label><input type="number" value={selectedPlatform.rotation} onChange={(e) => updatePlatform(selectedPlatform.id, { rotation: Number(e.target.value) })} /></div>
        {selectedPlatform.colorMode === "default" && <div className="wiring-prop-row"><label>填充</label><input type="color" value={selectedPlatform.fill} onChange={(e) => updatePlatform(selectedPlatform.id, { fill: e.target.value })} /></div>}
        <div className="wiring-prop-row"><label>图层</label><select value={selectedPlatform.layerId} onChange={(e) => updatePlatform(selectedPlatform.id, { layerId: e.target.value })}>{layers.filter((layer) => selectableLayers.includes(layer.id)).map((layer) => <option key={layer.id} value={layer.id}>{layer.name}</option>)}</select></div>
        <div className="wiring-prop-row" style={{ gridTemplateColumns: "1fr" }}>
          <div className="wiring-crossing-buttons">
            <button
              className={`wiring-btn ${(selectedPlatform.zIndexMode ?? "auto") === "auto" ? "active" : ""}`}
              onClick={() => {
                if ((selectedPlatform.zIndexMode ?? "auto") === "auto") return;
                updatePlatform(selectedPlatform.id, { zIndexMode: "auto" }, "站台层级跟随模块");
              }}
            >跟随模块</button>
            <button
              className={`wiring-btn ${selectedPlatform.zIndexMode === "manual" ? "active" : ""}`}
              onClick={() => {
                if (selectedPlatform.zIndexMode === "manual") return;
                const ownedIndex = selectedPlatform.moduleId
                  ? platforms.filter((platform) => platform.moduleId === selectedPlatform.moduleId).findIndex((platform) => platform.id === selectedPlatform.id)
                  : 0;
                updatePlatform(selectedPlatform.id, {
                  zIndexMode: "manual",
                  zIndex: effectivePlatformZIndex(selectedPlatform, modules, Math.max(0, ownedIndex)),
                }, "站台层级改为手动");
              }}
            >手动层级</button>
          </div>
        </div>
        <div className="wiring-prop-row"><label>Z-Index</label>{(selectedPlatform.zIndexMode ?? "auto") === "auto" ? (
          <input type="number" step={0.001} value={effectivePlatformZIndex(selectedPlatform, modules, Math.max(0, selectedPlatform.moduleId ? platforms.filter((platform) => platform.moduleId === selectedPlatform.moduleId).findIndex((platform) => platform.id === selectedPlatform.id) : 0))} readOnly />
        ) : (
          <input
            key={`${selectedPlatform.id}:${selectedPlatform.zIndex}`}
            type="number"
            step={0.5}
            defaultValue={selectedPlatform.zIndex}
            onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
            onBlur={(event) => {
              const zIndex = Number(event.target.value);
              if (!Number.isFinite(zIndex) || zIndex === selectedPlatform.zIndex) return;
              updatePlatform(selectedPlatform.id, { zIndexMode: "manual", zIndex }, "修改站台层级");
            }}
          />
        )}</div>
      </div>
      <div className="wiring-prop-actions"><button onClick={() => updatePlatform(selectedPlatform.id, { locked: !selectedPlatform.locked })}>{selectedPlatform.locked ? "解锁" : "锁定"}</button><button className="danger" onClick={() => deletePlatform(selectedPlatform.id)}>删除站台</button></div>
    </>
  );
}
