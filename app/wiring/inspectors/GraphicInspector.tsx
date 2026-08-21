"use client";

import { type AttachedGraphic } from "../types";
import { MirrorToggle } from "../ui/svgElements";
import { effectiveGraphicRadius } from "../canvasLogic";
import { type InspectorProps } from "./inspectorProps";

export function GraphicInspector({ ctx }: InspectorProps) {
  const {
    selectedGraphic,
    updateGraphic,
    selectedMod,
    modules,
    deleteSelected,
  } = ctx;

  if (!selectedGraphic) return null;

  return (
    <>
      <div className="wiring-prop-group"><h5>图标位置</h5>
        <div className="wiring-prop-row"><label>定位模式</label><select value={selectedGraphic.positionMode} onChange={(e) => { const positionMode = e.target.value as AttachedGraphic["positionMode"]; updateGraphic(selectedGraphic.id, { positionMode, attachedToId: positionMode === "attached" ? selectedGraphic.attachedToId || selectedMod?.id : undefined }); }}><option value="independent">独立</option><option value="attached">附着</option></select></div>
        {selectedGraphic.positionMode === "attached" && <div className="wiring-prop-row"><label>附着模块</label><select value={selectedGraphic.attachedToId || ""} onChange={(e) => { const owner = modules.find((module) => module.id === e.target.value); updateGraphic(selectedGraphic.id, { attachedToId: owner?.id, offsetX: owner ? selectedGraphic.x - owner.x : 0, offsetY: owner ? selectedGraphic.y - owner.y : 0 }); }}><option value="">未选择</option>{modules.map((module) => <option key={module.id} value={module.id}>{module.name}</option>)}</select></div>}
        <div className="wiring-prop-row"><label>宽度</label><input type="number" min={4} value={selectedGraphic.width} onChange={(e) => updateGraphic(selectedGraphic.id, { width: Math.max(4, Number(e.target.value)) })} /></div>
        <div className="wiring-prop-row"><label>高度</label><input type="number" min={4} value={selectedGraphic.height} onChange={(e) => updateGraphic(selectedGraphic.id, { height: Math.max(4, Number(e.target.value)) })} /></div>
        <div className="wiring-prop-row"><label>不透明度</label><input type="range" min={0.1} max={1} step={0.05} value={selectedGraphic.opacity} onChange={(e) => updateGraphic(selectedGraphic.id, { opacity: Number(e.target.value) })} /></div>
        <div className="wiring-prop-row"><label>旋转</label><input type="number" value={selectedGraphic.rotation} onChange={(e) => updateGraphic(selectedGraphic.id, { rotation: Number(e.target.value) })} /></div>
        <div className="wiring-prop-row"><label>镜像</label><MirrorToggle mirrorX={selectedGraphic.mirrorX} mirrorY={selectedGraphic.mirrorY} onChange={(next) => updateGraphic(selectedGraphic.id, next)} /></div>
      </div>
      {selectedGraphic.shapeType && !selectedGraphic.shapeType.startsWith("signal-") && (
        <div className="wiring-prop-group">
          <h5>填充与描边</h5>
          <div className="wiring-prop-row"><label>填充</label><input type="color" value={selectedGraphic.fill || "#cce6f5"} onChange={(e) => updateGraphic(selectedGraphic.id, { fill: e.target.value })} /></div>
          <div className="wiring-prop-row"><label>描边</label><input type="color" value={selectedGraphic.stroke || "#202124"} onChange={(e) => updateGraphic(selectedGraphic.id, { stroke: e.target.value })} /></div>
          <div className="wiring-prop-row"><label>描边粗细</label><input type="range" min={0.5} max={10} step={0.5} value={selectedGraphic.strokeWidth ?? 1.5} onChange={(e) => updateGraphic(selectedGraphic.id, { strokeWidth: Number(e.target.value) })} /></div>
          {selectedGraphic.shapeType === "roundRect" && (
            <div className="wiring-prop-row"><label>圆角</label><input type="range" min={0} max={Math.min(selectedGraphic.width, selectedGraphic.height) / 2} step={1} value={effectiveGraphicRadius(selectedGraphic.shapeType, selectedGraphic.width, selectedGraphic.height, selectedGraphic.radius)} onChange={(e) => updateGraphic(selectedGraphic.id, { radius: Number(e.target.value) })} /></div>
          )}
        </div>
      )}
      <div className="wiring-prop-actions"><button onClick={() => updateGraphic(selectedGraphic.id, { locked: !selectedGraphic.locked })}>{selectedGraphic.locked ? "解锁" : "锁定"}</button><button className="danger" onClick={deleteSelected}>{selectedGraphic.shapeType ? "删除图形" : "删除图标"}</button></div>
    </>
  );
}
