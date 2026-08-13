"use client";

import { centerBackgroundOnCanvas, fitBackgroundToCanvas, restoreBackgroundSize } from "../canvasLogic";
import { type InspectorProps } from "./inspectorProps";

export function BackgroundInspector({ ctx }: InspectorProps) {
  const {
    selectedBgImage,
    bgLocked,
    updateBgImage,
    layers,
    selectableLayers,
    activePage,
    replaceBackgroundInputRef,
    handleReplaceBackgroundInput,
    deleteBgImage,
  } = ctx;

  if (!selectedBgImage) return null;

  return (
    <>
      <div className="wiring-prop-group">
        <h5>背景图属性{bgLocked ? <span style={{ fontSize: 10, color: "var(--muted)" }}>（已锁定，全部参数不可修改）</span> : null}</h5>
        <div className="wiring-prop-row">
          <label>名称</label>
          <input type="text" value={selectedBgImage.name} disabled={bgLocked} onChange={(e) => updateBgImage(selectedBgImage.id, { name: e.target.value })} />
        </div>
        <div className="wiring-prop-row">
          <label>X 坐标</label>
          <input type="number" value={Math.round(selectedBgImage.x)} disabled={bgLocked} onChange={(e) => updateBgImage(selectedBgImage.id, { x: parseFloat(e.target.value) || 0 })} />
        </div>
        <div className="wiring-prop-row">
          <label>Y 坐标</label>
          <input type="number" value={Math.round(selectedBgImage.y)} disabled={bgLocked} onChange={(e) => updateBgImage(selectedBgImage.id, { y: parseFloat(e.target.value) || 0 })} />
        </div>
        <div className="wiring-prop-row">
          <label>缩放</label>
          <input type="number" step="0.1" min="0.05" value={selectedBgImage.scale.toFixed(2)} disabled={bgLocked} onChange={(e) => updateBgImage(selectedBgImage.id, { scale: parseFloat(e.target.value) || 0.1 })} />
        </div>
        <div className="wiring-prop-row"><label>旋转</label><input type="number" value={selectedBgImage.rotation || 0} disabled={bgLocked} onChange={(e) => updateBgImage(selectedBgImage.id, { rotation: Number(e.target.value) })} /></div>
        <div className="wiring-prop-row">
          <label>不透明度</label>
          <input type="range" min="0.05" max="1" step="0.05" value={selectedBgImage.opacity} disabled={bgLocked} onChange={(e) => updateBgImage(selectedBgImage.id, { opacity: parseFloat(e.target.value) })} />
        </div>
        <div className="wiring-prop-row">
          <label>图层</label>
          <select value={selectedBgImage.layerId} disabled={bgLocked} onChange={(e) => updateBgImage(selectedBgImage.id, { layerId: e.target.value })}>
            {layers.filter((l) => selectableLayers.includes(l.id)).map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="wiring-prop-actions">
        <button disabled={bgLocked} onClick={() => updateBgImage(selectedBgImage.id, fitBackgroundToCanvas(selectedBgImage, activePage), "背景图适应画布")}>适应画布</button>
        <button disabled={bgLocked} onClick={() => updateBgImage(selectedBgImage.id, centerBackgroundOnCanvas(selectedBgImage, activePage), "背景图居中")}>居中</button>
        <button disabled={bgLocked} onClick={() => updateBgImage(selectedBgImage.id, restoreBackgroundSize(selectedBgImage), "恢复背景原始尺寸")}>原始尺寸</button>
        <button disabled={bgLocked} onClick={() => replaceBackgroundInputRef.current?.click()}>替换</button>
        <input ref={replaceBackgroundInputRef} type="file" accept="image/*" onChange={handleReplaceBackgroundInput} style={{ display: "none" }} />
        <button onClick={() => updateBgImage(selectedBgImage.id, { locked: !selectedBgImage.locked })}>
          {selectedBgImage.locked ? "🔓 解锁背景图" : "🔒 锁定背景图"}
        </button>
        <button disabled={bgLocked} onClick={() => updateBgImage(selectedBgImage.id, { visible: !selectedBgImage.visible })}>
          {selectedBgImage.visible ? "🙈 隐藏背景图" : "👁 显示背景图"}
        </button>
        <button className="danger" onClick={() => deleteBgImage(selectedBgImage.id)}>🗑 删除背景图</button>
      </div>
    </>
  );
}
