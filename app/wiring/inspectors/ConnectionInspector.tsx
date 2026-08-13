"use client";

import { createAutoControlPoints } from "../connectionLogic";
import { effectiveConnectionZIndex } from "../canvasLogic";
import { type InspectorProps } from "./inspectorProps";

export function ConnectionInspector({ ctx }: InspectorProps) {
  const {
    selectedConnection,
    modules,
    history,
    setConnections,
    setHasUnsavedChanges,
    manualCurveEditingId,
    connections,
    setManualCurveEditingId,
    setStatus,
    setSelectedIds,
    updateConnectionAndPairedRail,
    updateConnection,
    setConnectionLineStyle,
    removeCrossingPoint,
    regenerateAutoControlPoints,
    addControlPointMidpoint,
    straightenConnection,
    removeControlPoint,
    cycleCrossingType,
    getConnectionEndpoints,
  } = ctx;

  if (!selectedConnection) return null;

  return (
    <>
      <div className="wiring-prop-group">
        <h5>连接属性</h5>
        <div className="wiring-prop-row">
          <label>连接 ID</label>
          <input type="text" value={selectedConnection.id.slice(-8)} readOnly style={{ fontFamily: "Consolas, monospace", color: "var(--muted)" }} />
        </div>
        <div className="wiring-prop-row">
          <label>起点模块</label>
          <input type="text" value={modules.find((m) => m.id === selectedConnection.fromModuleId)?.name || "?"} readOnly style={{ color: "var(--muted)" }} />
        </div>
        <div className="wiring-prop-row">
          <label>终点模块</label>
          <input type="text" value={modules.find((m) => m.id === selectedConnection.toModuleId)?.name || "?"} readOnly style={{ color: "var(--muted)" }} />
        </div>
        <div className="wiring-prop-row" style={{ gridTemplateColumns: "1fr" }}>
          <div className="wiring-crossing-buttons">
            <button
              className={`wiring-btn ${(selectedConnection.zIndexMode ?? "auto") === "auto" ? "active" : ""}`}
              onClick={() => {
                if ((selectedConnection.zIndexMode ?? "auto") === "auto") return;
                history.captureSnapshot("连接层级改为自动");
                setConnections((prev) => updateConnectionAndPairedRail(prev, selectedConnection.id, (connection) => ({ ...connection, zIndexMode: "auto" })));
                setHasUnsavedChanges(true);
              }}
            >
              自动层级
            </button>
            <button
              className={`wiring-btn ${selectedConnection.zIndexMode === "manual" ? "active" : ""}`}
              onClick={() => {
                if (selectedConnection.zIndexMode === "manual") return;
                const currentIndex = effectiveConnectionZIndex(selectedConnection, modules);
                history.captureSnapshot("连接层级改为手动");
                setConnections((prev) => updateConnectionAndPairedRail(prev, selectedConnection.id, (connection) => ({ ...connection, zIndexMode: "manual", zIndex: currentIndex })));
                setHasUnsavedChanges(true);
              }}
            >
              手动层级
            </button>
          </div>
        </div>
        <div className="wiring-prop-row">
          <label>Z-Index</label>
          {(selectedConnection.zIndexMode ?? "auto") === "auto" ? (
            <input type="number" step={0.5} value={effectiveConnectionZIndex(selectedConnection, modules)} readOnly />
          ) : (
            <input
              key={`${selectedConnection.id}:${selectedConnection.zIndex}`}
              type="number"
              step={0.5}
              defaultValue={selectedConnection.zIndex}
              onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
              onBlur={(event) => {
                const zIndex = Number(event.target.value);
                if (!Number.isFinite(zIndex) || zIndex === selectedConnection.zIndex) return;
                history.captureSnapshot("修改连接层级");
                setConnections((prev) => updateConnectionAndPairedRail(prev, selectedConnection.id, (connection) => ({ ...connection, zIndexMode: "manual", zIndex })));
                setHasUnsavedChanges(true);
              }}
            />
          )}
        </div>
        <p style={{ fontSize: 10, color: "var(--muted)", margin: "4px 0 0" }}>
          {(selectedConnection.zIndexMode ?? "auto") === "auto"
            ? "动态取两端模块 Z-Index 的中间值；端点层级变化时自动更新"
            : "使用手动 Z-Index；双线区间的配对轨道会同步更新"}
        </p>
      </div>

      <div className="wiring-prop-group">
        <h5>交叉类型</h5>
        <div className="wiring-prop-row" style={{ gridTemplateColumns: "1fr" }}>
          <div className="wiring-crossing-buttons">
            <button
              className={`wiring-btn ${selectedConnection.crossingType === "plain" ? "active" : ""}`}
              onClick={() => updateConnection(selectedConnection.id, { crossingType: "plain" }, "设置平面交叉")}
            >
              平面交叉
            </button>
            <button
              className={`wiring-btn ${selectedConnection.crossingType === "gap" ? "active" : ""}`}
              onClick={() => updateConnection(selectedConnection.id, { crossingType: "gap" }, "设置断开")}
            >
              断开
            </button>
            <button
              className={`wiring-btn ${selectedConnection.crossingType === "bridge" ? "active" : ""}`}
              onClick={() => updateConnection(selectedConnection.id, { crossingType: "bridge" }, "设置桥梁")}
            >
              桥梁
            </button>
          </div>
        </div>
        <p style={{ fontSize: 11, color: "var(--muted)", margin: "4px 0 0" }}>
          {selectedConnection.crossingType === "plain" && "两条轨道在同一平面交叉，列车通过道岔切换。"}
          {selectedConnection.crossingType === "gap" && "轨道在此处断开，两条线路立体分离，无道岔连接。"}
          {selectedConnection.crossingType === "bridge" && "一条轨道以桥梁形式跨越另一条轨道，无平面交叉。"}
        </p>
      </div>

      <div className="wiring-prop-group">
        <h5>线型</h5>
        <div className="wiring-prop-row" style={{ gridTemplateColumns: "1fr" }}>
          <div className="wiring-crossing-buttons">
            <button
              className={`wiring-btn ${(selectedConnection.lineStyle ?? "solid") === "solid" ? "active" : ""}`}
              onClick={() => setConnectionLineStyle(selectedConnection.id, "solid")}
            >
              实线
            </button>
            <button
              className={`wiring-btn ${selectedConnection.lineStyle === "dashed" ? "active" : ""}`}
              onClick={() => setConnectionLineStyle(selectedConnection.id, "dashed")}
            >
              虚线
            </button>
          </div>
        </div>
        <p style={{ fontSize: 11, color: "var(--muted)", margin: "4px 0 0" }}>
          {selectedConnection.lineStyle === "dashed"
            ? "虚线表示预留段、未开通段或地下隧道段等非在用轨道"
            : "实线表示在用轨道；虚线可用于预留段、未开通段或地下隧道段"}
        </p>
      </div>

      <div className="wiring-prop-group">
        <h5>交叉点（{selectedConnection.crossingPoints.length}）</h5>
        {selectedConnection.crossingPoints.length === 0 ? (
          <p style={{ fontSize: 11, color: "var(--muted)", margin: "4px 0" }}>暂无交叉点</p>
        ) : (
          <div className="wiring-crossing-list">
            {selectedConnection.crossingPoints.map((cp, i) => (
              <div key={i} className="wiring-crossing-row">
                <span>#{i + 1} ({Math.round(cp.x)}, {Math.round(cp.y)})</span>
                <button className="wiring-btn danger" onClick={() => removeCrossingPoint(selectedConnection.id, i)}>删除</button>
              </div>
            ))}
          </div>
        )}
        <p style={{ fontSize: 10, color: "var(--muted)", margin: "6px 0 0" }}>
          双击连接切换交叉类型 · 点击轨道线上的圆点删除交叉点
        </p>
      </div>

      <div className="wiring-prop-group">
        <h5>贝塞尔曲线</h5>
        {(() => {
          const manualOn = selectedConnection.autoCurve === false || manualCurveEditingId === selectedConnection.id;
          const autoOn = !manualOn && selectedConnection.autoCurve !== false;
          const straightOn = selectedConnection.autoCurve === false && selectedConnection.controlPoints.length === 0;
          return (
            <div className="wiring-segmented" style={{ margin: "4px 0" }}>
              <button
                className={straightOn ? "active" : ""}
                onClick={() => {
                  if (straightOn) return;
                  history.captureSnapshot("切换为直线连接");
                  const conn = connections.find((c) => c.id === selectedConnection.id);
                  if (!conn) return;
                  const ends = getConnectionEndpoints(conn);
                  setConnections((prev) => updateConnectionAndPairedRail(prev, selectedConnection.id, (c) => ({
                    ...c,
                    autoCurve: false,
                    controlPoints: [],
                  })));
                  setHasUnsavedChanges(true);
                  setStatus("已切换为直线连接");
                }}
                title="直线连接，不生成控制点"
              >
                直线
              </button>
              <button
                className={manualOn ? "active" : ""}
                onClick={() => {
                  if (manualOn) return;
                  const conn = connections.find((c) => selectedConnection && c.id === selectedConnection.id);
                  if (!conn) return;
                  history.captureSnapshot("切换为手动曲线");
                  // 从直线切换过来 → 生成隐式锚点让用户有起点
                  const ends = getConnectionEndpoints(conn);
                  const cps = ends
                    ? createAutoControlPoints(ends.from, ends.to, ends.fromDir, ends.toDir, {
                        middle: `${conn.fromModuleId}:${conn.fromPortId}:${conn.toModuleId}:${conn.toPortId}:middle`,
                      })
                    : [];
                  setManualCurveEditingId(conn.id);
                  setConnections((prev) => updateConnectionAndPairedRail(prev, conn.id, (c) => ({
                    ...c,
                    autoCurve: false,
                    controlPoints: cps,
                  })));
                  setHasUnsavedChanges(true);
                  setStatus("已切换为手动曲线模式，可自由调整轨道节点");
                }}
                title="手动调整轨道节点和曲率"
              >
                手动曲线
              </button>
              <button
                className={autoOn ? "active" : ""}
                onClick={() => {
                  if (autoOn) return;
                  setManualCurveEditingId(null);
                  history.captureSnapshot("切换为自动曲线");
                  setConnections((prev) => updateConnectionAndPairedRail(prev, selectedConnection.id, (c) => ({
                    ...c,
                    autoCurve: true,
                  })));
                  setHasUnsavedChanges(true);
                  setTimeout(() => regenerateAutoControlPoints(selectedConnection.id), 0);
                }}
                title="根据端口位置自动生成对称贝塞尔曲线"
              >
                自动曲线
              </button>
            </div>
          );
        })()}
        <p style={{ fontSize: 10, color: "var(--muted)", margin: "2px 0" }}>
          直线：无控制点, 直线连接 · 手动：自由调整 · 自动：端口移动时自动更新
        </p>
      </div>

      <div className="wiring-prop-group">
        <h5>连接轨道颜色</h5>
        <div className="wiring-prop-row" style={{ gridTemplateColumns: "1fr" }}>
          <div className="wiring-crossing-buttons">
            <button
              className={`wiring-btn ${(selectedConnection.colorMode ?? "auto") === "auto" ? "active" : ""}`}
              onClick={() => updateConnection(selectedConnection.id, { colorMode: "auto" }, "设置自动轨道颜色")}
            >
              自动跟随
            </button>
            <button
              className={`wiring-btn ${selectedConnection.colorMode === "manual" ? "active" : ""}`}
              onClick={() => updateConnection(selectedConnection.id, { colorMode: "manual" }, "设置手动轨道颜色")}
            >
              手动
            </button>
          </div>
        </div>
        {(selectedConnection.colorMode ?? "auto") === "manual" && (
          <div className="wiring-prop-row">
            <label>颜色</label>
            <div className="wiring-prop-color">
              <input type="color" value={selectedConnection.color || "#202124"} onChange={(e) => updateConnection(selectedConnection.id, { color: e.target.value }, "设置连接颜色")} />
              <input type="text" value={selectedConnection.color || "#202124"} onChange={(e) => updateConnection(selectedConnection.id, { color: e.target.value }, "设置连接颜色")} />
            </div>
          </div>
        )}
        <p style={{ fontSize: 10, color: "var(--muted)", margin: "4px 0 0" }}>
          {(selectedConnection.colorMode ?? "auto") === "auto"
            ? "根据两端模块的线路颜色自动填充；两端颜色不同时显示渐变色"
            : "使用手动指定的颜色"}
        </p>
      </div>

      <div className="wiring-prop-group">
        {(() => {
          const visibleCPs = selectedConnection.controlPoints.filter((cp) => !cp.implicit);
          const implicitCount = selectedConnection.controlPoints.length - visibleCPs.length;
          return (
            <>
              <h5>轨道节点（{visibleCPs.length}{implicitCount > 0 ? ` + ${implicitCount} 隐式` : ""}）</h5>
              <div className="wiring-prop-row" style={{ gridTemplateColumns: "1fr" }}>
                <div className="wiring-crossing-buttons">
                  <button className="wiring-btn" onClick={() => addControlPointMidpoint(selectedConnection.id)}>
                    添加节点
                  </button>
                  <button
                    className="wiring-btn danger"
                    disabled={selectedConnection.controlPoints.length === 0}
                    onClick={() => straightenConnection(selectedConnection.id)}
                  >
                    拉直轨道
                  </button>
                </div>
              </div>
              {visibleCPs.length === 0 && implicitCount === 0 ? (
                <p style={{ fontSize: 11, color: "var(--muted)", margin: "4px 0" }}>
                  暂无节点（直线连接）
                </p>
              ) : (
                <div className="wiring-crossing-list">
                  {visibleCPs.map((cp, i) => (
                    <div key={cp.id} className="wiring-crossing-row">
                      <span>
                        #{i + 1} ({Math.round(cp.x)}, {Math.round(cp.y)}){cp.curved ? " · 曲" : ""}
                      </span>
                      <button className="wiring-btn danger" onClick={() => removeControlPoint(selectedConnection.id, cp.id)}>
                        删除
                      </button>
                    </div>
                  ))}
                  {implicitCount > 0 && (
                    <p style={{ fontSize: 10, color: "var(--muted)", margin: "2px 0" }}>
                      · {implicitCount} 个隐式锚点（靠近端口，自动平滑）
                    </p>
                  )}
                </div>
              )}
              <p style={{ fontSize: 10, color: "var(--muted)", margin: "6px 0 0" }}>
                Alt+点击轨道添加节点 · 拖拽节点移动 · 双击节点切换曲率 · 拖拽手柄调整弧度
              </p>
            </>
          );
        })()}
      </div>

      <div className="wiring-prop-actions">
        <button onClick={() => cycleCrossingType(selectedConnection.id)}>切换交叉类型</button>
        <button className="danger" onClick={() => {
          history.captureSnapshot("删除连接");
          const pairedId = selectedConnection.pairedConnectionId;
          setConnections((prev) => prev.filter((c) => c.id !== selectedConnection.id && c.id !== pairedId));
          setSelectedIds([]);
          setHasUnsavedChanges(true);
          setStatus("已删除连接");
        }}>🗑 删除连接</button>
      </div>
    </>
  );
}
