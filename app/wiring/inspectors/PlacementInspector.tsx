"use client";

import { PLACEMENT_Z_LEVELS } from "../ui/primitives";
import { type InspectorProps } from "./inspectorProps";

export function PlacementInspector({ ctx }: InspectorProps) {
  const {
    advancedMode,
    placementRotation,
    setPlacementRotation,
    placementMirrorX,
    setPlacementMirrorX,
    placementMirrorY,
    setPlacementMirrorY,
    placementZIndex,
    setPlacementZIndex,
    placementLayerId,
    setPlacementLayerId,
    selectableLayers,
    automaticPlacementLayerName,
    layers,
  } = ctx;

  return (
    <>
      {advancedMode && (
        <div className="wiring-prop-group wiring-placement-rotation-panel">
          <h5>放置方向</h5>
          <div className="wiring-placement-rotation" aria-label="下一次放置的旋转方向">
            <div className="wiring-rotation-grid">
              {[
                { rotation: 225, icon: "↖", label: "左上 225°" },
                { rotation: 270, icon: "↑", label: "向上 270°" },
                { rotation: 315, icon: "↗", label: "右上 315°" },
                { rotation: 180, icon: "←", label: "向左 180°" },
                { rotation: 0, icon: "•", label: "重置为默认方向", reset: true },
                { rotation: 0, icon: "→", label: "向右 0°" },
                { rotation: 135, icon: "↙", label: "左下 135°" },
                { rotation: 90, icon: "↓", label: "向下 90°" },
                { rotation: 45, icon: "↘", label: "右下 45°" },
              ].map((option, index) => (
                <button key={`${option.label}-${index}`} type="button" className={option.reset ? "reset" : placementRotation === option.rotation ? "active" : ""} onClick={() => setPlacementRotation(option.rotation)} title={option.label} aria-label={option.label}>{option.icon}</button>
              ))}
            </div>
            <span>{placementRotation}°</span>
          </div>
          <div className="wiring-mirror-toggle wiring-mirror-placement">
            <button type="button" className={`wiring-mirror-btn ${placementMirrorX ? "active" : ""}`} onClick={() => setPlacementMirrorX(!placementMirrorX)} title="下一次放置水平镜像（左右翻转）" aria-pressed={placementMirrorX}>⇔ 水平</button>
            <button type="button" className={`wiring-mirror-btn ${placementMirrorY ? "active" : ""}`} onClick={() => setPlacementMirrorY(!placementMirrorY)} title="下一次放置垂直镜像（上下翻转）" aria-pressed={placementMirrorY}>↕ 垂直</button>
          </div>
        </div>
      )}
      <div className="wiring-prop-group wiring-placement-defaults-panel">
        <h5>放置属性</h5>
        <div className="wiring-prop-row">
          <label>放置层级</label>
          <select value={placementZIndex} onChange={(event) => setPlacementZIndex(Number(event.target.value))}>
            {PLACEMENT_Z_LEVELS.map((level) => (
              <option key={level.value} value={level.value}>{level.label}（{level.value}）</option>
            ))}
          </select>
        </div>
        <div className="wiring-prop-row">
          <label>图层</label>
          <select
            value={placementLayerId === "auto" || selectableLayers.includes(placementLayerId) ? placementLayerId : "auto"}
            onChange={(event) => setPlacementLayerId(event.target.value)}
          >
            <option value="auto">自动分配{automaticPlacementLayerName ? `（${automaticPlacementLayerName}）` : "（按元件类型）"}</option>
            {layers.filter((layer) => selectableLayers.includes(layer.id)).map((layer) => (
              <option key={layer.id} value={layer.id}>{layer.name}</option>
            ))}
          </select>
        </div>
        <p className="wiring-placement-defaults-note">只影响之后放置的内容；选择“自动分配”时按元件类型和线路类别进入对应图层。</p>
      </div>
    </>
  );
}
