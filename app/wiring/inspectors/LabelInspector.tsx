"use client";

import { type LabelAnchor } from "../types";
import { lineOptionLabel } from "../../transit/types";
import { type InspectorProps } from "./inspectorProps";

export function LabelInspector({ ctx }: InspectorProps) {
  const {
    selectedLabel,
    updateLabel,
    modules,
    layers,
    selectableLayers,
    moveLabelToEdge,
    overlappingLabelItems,
    renderItemName,
    isLayerLocked,
    moveLabelRelative,
    data,
    deleteLabel,
  } = ctx;

  if (!selectedLabel) return null;

  return (
    <>
      <div className="wiring-prop-group">
        <h5>文字内容</h5>
        {selectedLabel.numeralType ? (
          <>
            <div className="wiring-prop-row">
              <label>类型</label>
              <select value={selectedLabel.numeralType} onChange={(e) => updateLabel(selectedLabel.id, { numeralType: e.target.value as "track" | "switch" })}>
                <option value="track">股道编号</option>
                <option value="switch">道岔编号</option>
              </select>
            </div>
            <div className="wiring-prop-row">
              <label>编号</label>
              <input type="number" min={1} step={1} value={parseInt(selectedLabel.text, 10) || ""} onChange={(e) => updateLabel(selectedLabel.id, { text: String(Math.max(1, Math.round(Number(e.target.value) || 1))) })} />
            </div>
            <div className="wiring-prop-row" style={{ gridTemplateColumns: "1fr" }}>
              <span style={{ fontSize: 11, color: "var(--muted)" }}>显示为「{selectedLabel.numeralType === "track" ? `${selectedLabel.text}道` : `#${selectedLabel.text}`}」</span>
            </div>
          </>
        ) : (
          <div className="wiring-prop-row" style={{ gridTemplateColumns: "1fr" }}>
            <textarea
              value={selectedLabel.text}
              onChange={(e) => updateLabel(selectedLabel.id, { text: e.target.value })}
              rows={2}
              style={{ minHeight: 48, padding: "6px 8px", border: "1px solid var(--border)", borderRadius: 7, fontSize: 12, resize: "vertical", fontFamily: "inherit" }}
            />
          </div>
        )}
      </div>

      <div className="wiring-prop-group">
        <h5>位置与变换</h5>
        <div className="wiring-prop-row">
          <label>定位模式</label>
          <select value={selectedLabel.positionMode || (selectedLabel.attachedToId ? "attached" : "independent")} onChange={(event) => updateLabel(selectedLabel.id, { positionMode: event.target.value as "attached" | "independent" })}>
            <option value="independent">独立</option>
            <option value="attached">附着</option>
          </select>
        </div>
        {(selectedLabel.positionMode === "attached" || selectedLabel.attachedToId) && (
          <div className="wiring-prop-row">
            <label>附着模块</label>
            <select value={selectedLabel.attachedToId || ""} onChange={(event) => updateLabel(selectedLabel.id, { attachedToId: event.target.value || undefined, positionMode: event.target.value ? "attached" : "independent" })}>
              <option value="">未选择</option>
              {modules.map((module) => <option key={module.id} value={module.id}>{module.name}</option>)}
            </select>
          </div>
        )}
        <div className="wiring-prop-row">
          <label>X 坐标</label>
          <input type="number" value={Math.round(selectedLabel.x)} onChange={(e) => updateLabel(selectedLabel.id, { x: parseFloat(e.target.value) || 0 })} />
        </div>
        <div className="wiring-prop-row">
          <label>Y 坐标</label>
          <input type="number" value={Math.round(selectedLabel.y)} onChange={(e) => updateLabel(selectedLabel.id, { y: parseFloat(e.target.value) || 0 })} />
        </div>
        <div className="wiring-prop-row">
          <label>旋转</label>
          <select value={selectedLabel.rotation} onChange={(e) => updateLabel(selectedLabel.id, { rotation: parseInt(e.target.value) })}>
            <option value={0}>0°</option>
            <option value={90}>90°</option>
            <option value={180}>180°</option>
            <option value={270}>270°</option>
          </select>
        </div>
        <div className="wiring-prop-row">
          <label>层级</label>
          <select value={selectedLabel.layerId} onChange={(e) => updateLabel(selectedLabel.id, { layerId: e.target.value })}>
            {layers.filter((l) => selectableLayers.includes(l.id)).map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </div>
        <div className="wiring-layer-edge-actions">
          <button type="button" onClick={() => moveLabelToEdge(selectedLabel, true)}>⇈ 全局置顶</button>
          <button type="button" onClick={() => moveLabelToEdge(selectedLabel, false)}>⇊ 全局置底</button>
        </div>
        <div className="wiring-label-overlap-stack">
          <b>文字范围内层级（{overlappingLabelItems.length}）</b>
          {overlappingLabelItems.length === 0 && <span>当前文字范围内没有其他元件</span>}
          {overlappingLabelItems.map((entry) => (
            <div key={`${entry.kind}-${entry.item.id}`}>
              <span title={renderItemName(entry)}>{renderItemName(entry)}</span>
              <button type="button" disabled={isLayerLocked(entry.item.layerId)} onClick={() => moveLabelRelative(selectedLabel, entry, true)}>置于上方</button>
              <button type="button" disabled={isLayerLocked(entry.item.layerId)} onClick={() => moveLabelRelative(selectedLabel, entry, false)}>置于下方</button>
            </div>
          ))}
        </div>
      </div>

      <div className="wiring-prop-group">
        <h5>字体样式</h5>
        <div className="wiring-prop-row" style={{ gridTemplateColumns: "1fr" }}>
          <div className="wiring-crossing-buttons">
            <button
              className={`wiring-btn ${selectedLabel.colorMode === "default" ? "active" : ""}`}
              onClick={() => updateLabel(selectedLabel.id, { colorMode: "default" }, "设置默认文字颜色")}
            >
              手动
            </button>
            <button
              className={`wiring-btn ${(selectedLabel.colorMode ?? "line") === "line" ? "active" : ""}`}
              onClick={() => updateLabel(selectedLabel.id, { colorMode: "line" }, "设置文字跟随线路颜色")}
            >
              跟随线路
            </button>
          </div>
        </div>
        <p style={{ fontSize: 10, color: "var(--muted)", margin: "4px 0 0" }}>
          {selectedLabel.colorMode === "default" && "使用手动指定的颜色"}
          {(selectedLabel.colorMode ?? "line") === "line" && "独立文字可绑定线路；附着文字未指定线路时跟随所属模块"}
        </p>
        {(selectedLabel.colorMode ?? "line") === "line" && (
          <div className="wiring-prop-row">
            <label>绑定线路</label>
            <select value={selectedLabel.sourceLineId || ""} onChange={(event) => updateLabel(selectedLabel.id, { sourceLineId: event.target.value || undefined }, "绑定文字线路") }>
              <option value="">{selectedLabel.attachedToId ? "自动跟随附着模块" : "请选择线路"}</option>
              {data.lines.map((line) => <option key={line.id} value={line.id}>{lineOptionLabel(line)}</option>)}
            </select>
          </div>
        )}
        <div className="wiring-prop-row">
          <label>字号</label>
          <input type="number" min={6} max={72} value={selectedLabel.fontSize} onChange={(e) => updateLabel(selectedLabel.id, { fontSize: parseInt(e.target.value) || 14 })} />
        </div>
        <div className="wiring-prop-row">
          <label>字重</label>
          <select value={selectedLabel.fontWeight} onChange={(e) => updateLabel(selectedLabel.id, { fontWeight: parseInt(e.target.value) })}>
            <option value={400}>常规 400</option>
            <option value={600}>半粗 600</option>
            <option value={700}>粗体 700</option>
            <option value={900}>特粗 900</option>
          </select>
        </div>
        {(selectedLabel.colorMode ?? "default") === "default" && (
          <div className="wiring-prop-row">
            <label>颜色</label>
            <div className="wiring-prop-color">
              <input type="color" value={selectedLabel.fill} onChange={(e) => updateLabel(selectedLabel.id, { fill: e.target.value })} />
              <input type="text" value={selectedLabel.fill} onChange={(e) => updateLabel(selectedLabel.id, { fill: e.target.value })} />
            </div>
          </div>
        )}
      </div>

      <div className="wiring-prop-group">
        <h5>锚点方向</h5>
        <div className="wiring-prop-row" style={{ gridTemplateColumns: "1fr" }}>
          <select value={selectedLabel.anchor} onChange={(e) => updateLabel(selectedLabel.id, { anchor: e.target.value as LabelAnchor })}>
            <option value="top">上 (top)</option>
            <option value="bottom">下 (bottom)</option>
            <option value="left">左 (left)</option>
            <option value="right">右 (right)</option>
            <option value="top_left">左上 (top_left)</option>
            <option value="top_right">右上 (top_right)</option>
            <option value="bottom_left">左下 (bottom_left)</option>
            <option value="bottom_right">右下 (bottom_right)</option>
          </select>
        </div>
      </div>

      <div className="wiring-prop-group">
        <h5>背景与描边</h5>
        <div className="wiring-prop-row">
          <label>文字背景</label>
          <label className="wiring-check"><input type="checkbox" checked={selectedLabel.backgroundEnabled === true} onChange={(e) => updateLabel(selectedLabel.id, { backgroundEnabled: e.target.checked })} />启用实色背景</label>
        </div>
        {selectedLabel.backgroundEnabled && <>
          <div className="wiring-prop-row"><label>背景颜色</label><div className="wiring-prop-color"><input type="color" value={selectedLabel.backgroundColor || "#ffffff"} onChange={(e) => updateLabel(selectedLabel.id, { backgroundColor: e.target.value })} /><input type="text" value={selectedLabel.backgroundColor || "#ffffff"} onChange={(e) => updateLabel(selectedLabel.id, { backgroundColor: e.target.value })} /></div></div>
          <div className="wiring-prop-row"><label>背景留白</label><input type="number" min={0} max={24} value={selectedLabel.backgroundPadding ?? 4} onChange={(e) => updateLabel(selectedLabel.id, { backgroundPadding: Math.max(0, Number(e.target.value)) })} /></div>
        </>}
        <div className="wiring-prop-row">
          <label>文字描边</label>
          <label className="wiring-check"><input type="checkbox" checked={selectedLabel.backgroundMask} onChange={(e) => updateLabel(selectedLabel.id, { backgroundMask: e.target.checked })} />启用描边</label>
        </div>
        {selectedLabel.backgroundMask && (
          <>
            <div className="wiring-prop-row"><label>描边颜色</label><div className="wiring-prop-color"><input type="color" value={selectedLabel.outlineColor || "#ffffff"} onChange={(e) => updateLabel(selectedLabel.id, { outlineColor: e.target.value })} /><input type="text" value={selectedLabel.outlineColor || "#ffffff"} onChange={(e) => updateLabel(selectedLabel.id, { outlineColor: e.target.value })} /></div></div>
            <div className="wiring-prop-row"><label>描边宽度</label><input type="number" min={0.5} max={12} step={0.5} value={selectedLabel.maskStrokeWidth} onChange={(e) => updateLabel(selectedLabel.id, { maskStrokeWidth: parseFloat(e.target.value) || 2 })} /></div>
          </>
        )}
        <p style={{ fontSize: 10, color: "var(--muted)", margin: "6px 0 0" }}>元件库文字保持独立定位，不参与自动避障。</p>
      </div>

      <div className="wiring-prop-actions">
        <button onClick={() => updateLabel(selectedLabel.id, { locked: !selectedLabel.locked })}>
          {selectedLabel.locked ? "🔓 解锁标签" : "🔒 锁定标签"}
        </button>
        <button onClick={() => updateLabel(selectedLabel.id, { visible: !selectedLabel.visible })}>
          {selectedLabel.visible ? "🙈 隐藏标签" : "👁 显示标签"}
        </button>
        <button className="danger" onClick={() => deleteLabel(selectedLabel.id)}>🗑 删除标签</button>
      </div>
    </>
  );
}
