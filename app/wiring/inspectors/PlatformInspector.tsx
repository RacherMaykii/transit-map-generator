"use client";

import { CANVAS_ANCHOR_NAMES, canvasAnchorArrowGrid, computePlatformResizeFromSize, effectivePlatformZIndex, MIN_PLATFORM_HEIGHT, MIN_PLATFORM_WIDTH, platformAnchorDescription, type CanvasAnchor } from "../canvasLogic";
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

  const anchor = (selectedPlatform.resizeAnchor ?? 0) as CanvasAnchor;

  /** 输入框改长度/厚度：按九宫格锚点反解位置，锚点处保持不动 */
  const applyAnchoredSize = (patch: { width?: number; height?: number }, opName: string) => {
    const result = computePlatformResizeFromSize(
      { x: selectedPlatform.x, y: selectedPlatform.y, width: selectedPlatform.width, height: selectedPlatform.height, rotation: selectedPlatform.rotation },
      anchor,
      patch.width ?? selectedPlatform.width,
      patch.height ?? selectedPlatform.height,
      MIN_PLATFORM_WIDTH,
      MIN_PLATFORM_HEIGHT,
    );
    updatePlatform(selectedPlatform.id, { x: result.x, y: result.y, width: result.width, height: result.height }, opName);
  };

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
        <div className="wiring-prop-row"><label>长度</label><input type="number" min={MIN_PLATFORM_WIDTH} value={selectedPlatform.width} onChange={(e) => { const raw = Number(e.target.value); if (Number.isFinite(raw)) applyAnchoredSize({ width: raw }, "设置站台长度"); }} /></div>
        <div className="wiring-prop-row"><label>厚度</label><input type="number" min={MIN_PLATFORM_HEIGHT} value={selectedPlatform.height} onChange={(e) => { const raw = Number(e.target.value); if (Number.isFinite(raw)) applyAnchoredSize({ height: raw }, "设置站台厚度"); }} /></div>
        <div className="wiring-prop-row"><label>旋转</label><input type="number" value={selectedPlatform.rotation} onChange={(e) => updatePlatform(selectedPlatform.id, { rotation: Number(e.target.value) })} /></div>
        <div className="wiring-anchor-field" style={{ marginBottom: 8 }}>
          <span>调整锚点</span>
          <div className="wiring-anchor-grid">
            {canvasAnchorArrowGrid(anchor).map((arrow, index) => (
              <button
                key={index}
                type="button"
                className={anchor === index ? "selected" : ""}
                onClick={() => updatePlatform(selectedPlatform.id, { resizeAnchor: index }, "设置站台调整锚点")}
                title={`锚点：${CANVAS_ANCHOR_NAMES[index] ?? ""}（${platformAnchorDescription(index as CanvasAnchor)}）`}
              >{arrow}</button>
            ))}
          </div>
          <p className="wiring-anchor-hint">{platformAnchorDescription(anchor)}</p>
        </div>
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
