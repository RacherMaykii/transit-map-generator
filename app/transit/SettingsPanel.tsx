"use client";

// 设置弹窗组件，从 TransitMapApp.tsx 拆出（原 1373–1844 逐字迁移）。
// 弹窗内全部交互经 props 注入（updateLayout/undo/saveLayout/onClose 与 6 个
// handleInteraction* 捕获处理器）；状态与撤销逻辑保留在 TransitMapApp。

import type { FocusEvent as ReactFocusEvent, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import {
  defaultLayoutForTemplate,
  type Direction,
  type LayoutConfig,
  type Station,
  stationOptionLabel,
  type StyleTemplateId,
  type TransitData,
  type TransitLine,
} from "./types";
import { terminusForDirection, terminusSideFor } from "./route-orientation.mjs";
import {
  DirectionPreviewSvg,
  LineBadgePreviewSvg,
  StationPreviewSvg,
  TextCardPreviewSvg,
} from "./RoutePreviewSvg";
import {
  ScenicDirectionPreviewSvg,
  ScenicLineBadgePreviewSvg,
  ScenicStationPreviewSvg,
  ScenicTextCardPreviewSvg,
} from "./styles/scenic/ScenicRoutePreviewSvg";
import { ColorField, NumberSetting } from "./settingsControls";

export type SettingsPreviewMode = "station" | "current" | "next" | "direction" | "badge";

export interface SettingsPanelProps {
  data: TransitData;
  line: TransitLine | undefined;
  stations: Station[];
  currentStation: Station | undefined;
  nextStation: Station | undefined;
  currentIndex: number;
  setCurrentIndex: (index: number) => void;
  settingsPreviewMode: SettingsPreviewMode;
  setSettingsPreviewMode: (mode: SettingsPreviewMode) => void;
  direction: Direction;
  platformType: "island" | "side";
  visualDirection: Direction;
  transparent: boolean;
  scenicAssetsReady: boolean;
  undoStack: TransitData[];
  layoutDirty: boolean;
  selectStyleTemplate: (template: StyleTemplateId) => void;
  updateLayout: (patch: Partial<LayoutConfig>) => void;
  undo: () => void;
  saveLayout: () => void;
  onClose: () => void;
  handleInteractionFocus: (event: ReactFocusEvent<HTMLElement>) => void;
  handleInteractionBlur: (event: ReactFocusEvent<HTMLElement>) => void;
  handleInteractionPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  handleInteractionPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
  handleInteractionKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => void;
  handleInteractionKeyUp: (event: ReactKeyboardEvent<HTMLElement>) => void;
}

export function SettingsPanel({
  data,
  line,
  stations,
  currentStation,
  nextStation,
  currentIndex,
  setCurrentIndex,
  settingsPreviewMode,
  setSettingsPreviewMode,
  direction,
  platformType,
  visualDirection,
  transparent,
  scenicAssetsReady,
  undoStack,
  layoutDirty,
  selectStyleTemplate,
  updateLayout,
  undo,
  saveLayout,
  onClose,
  handleInteractionFocus,
  handleInteractionBlur,
  handleInteractionPointerDown,
  handleInteractionPointerUp,
  handleInteractionKeyDown,
  handleInteractionKeyUp,
}: SettingsPanelProps) {
  return (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
          <section
            className="editor-modal settings-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-title"
            onFocusCapture={handleInteractionFocus}
            onBlurCapture={handleInteractionBlur}
            onPointerDownCapture={handleInteractionPointerDown}
            onPointerUpCapture={handleInteractionPointerUp}
            onPointerCancelCapture={handleInteractionPointerUp}
            onKeyDownCapture={handleInteractionKeyDown}
            onKeyUpCapture={handleInteractionKeyUp}
          >
            <div className="modal-heading">
              <div><p className="eyebrow">预览与导出共用</p><h2 id="settings-title">显示设置</h2></div>
              <button className="close-button" onClick={() => onClose()}>×</button>
            </div>
            <div className="style-template-tabs" role="tablist" aria-label="选择站序图样式模板">
              {([
                ["classic", "经典样式", "当前站序图样式"],
                ["loop", "环线样式", "半圆弧线站序图"],
                ["scenic", "景区样式", "景区导览专用布局"],
                ["pulse", "城市脉冲", "深色高对比信息带"],
              ] as const).map(([template, label, description]) => (
                <button
                  key={template}
                  type="button"
                  role="tab"
                  id={`style-template-tab-${template}`}
                  aria-controls={`style-template-panel-${template}`}
                  aria-selected={data.activeStyleTemplate === template}
                  tabIndex={data.activeStyleTemplate === template ? 0 : -1}
                  className={data.activeStyleTemplate === template ? "active" : ""}
                  onClick={() => selectStyleTemplate(template)}
                >
                  <span className={`style-template-icon ${template}`}><i /></span>
                  <span><b>{label}</b><small>{description}</small></span>
                  <em>{data.activeStyleTemplate === template ? "当前" : "可用"}</em>
                </button>
              ))}
            </div>
            {line && <p className="settings-help style-binding-note">当前样式绑定至线路：<b>{line.nameZh}</b>。切换预览线路后会自动使用该线路已保存的样式。</p>}
            <div
              id={`style-template-panel-${data.activeStyleTemplate}`}
              className="settings-workspace"
              role="tabpanel"
              aria-labelledby={`style-template-tab-${data.activeStyleTemplate}`}
            >
              <div className="settings-body">
              {data.activeStyleTemplate === "loop" && (
                <section className="settings-section">
                  <h3>环线弧形布局</h3>
                  <p className="settings-help position-settings-help">站点沿浅半圆弧排列；最左侧输出环线运行组件，最右侧输出当前线路标识。当前站会显示运行方向小箭头。</p>
                  <div className="settings-grid">
                    <NumberSetting label="圆弧起伏" value={data.layout.loopArcDepth} min={0} max={30} step={0.5} onChange={(value) => updateLayout({ loopArcDepth: value })} />
                    <NumberSetting label="底部色条高度" value={data.layout.loopBottomBarHeight} min={4} max={28} step={0.5} onChange={(value) => updateLayout({ loopBottomBarHeight: value })} />
                    <NumberSetting label="方向箭头大小" value={data.layout.loopDirectionMarkerSize} min={4} max={16} step={0.5} onChange={(value) => updateLayout({ loopDirectionMarkerSize: value })} />
                    <NumberSetting label="方向箭头上下间距" value={data.layout.loopDirectionMarkerOffset} min={0} max={20} step={0.5} onChange={(value) => updateLayout({ loopDirectionMarkerOffset: value })} />
                    <NumberSetting label="中文距圆心" value={data.layout.loopStationZhOffset} min={24} max={60} step={0.5} onChange={(value) => updateLayout({ loopStationZhOffset: value })} />
                    <NumberSetting label="英文距圆心" value={data.layout.loopStationEnOffset} min={12} max={44} step={0.5} onChange={(value) => updateLayout({ loopStationEnOffset: value })} />
                  </div>
                </section>
              )}
              {data.activeStyleTemplate === "pulse" && (
                <section className="settings-section pulse-style-settings">
                  <h3>城市脉冲视觉</h3>
                  <p className="settings-help position-settings-help">深色底板搭配双层发光轨道、胶囊站点和顶部序号带；本站、换乘、方向及线路标识均使用同一套高对比信息层级。</p>
                  <div className="settings-grid">
                    <NumberSetting label="轨道底层宽度" value={data.layout.pulseGlowWidth} min={6} max={24} step={0.5} onChange={(value) => updateLayout({ pulseGlowWidth: value })} />
                    <NumberSetting label="胶囊站点宽度" value={data.layout.pulseNodeWidth} min={18} max={52} step={0.5} onChange={(value) => updateLayout({ pulseNodeWidth: value })} />
                    <NumberSetting label="胶囊站点高度" value={data.layout.pulseNodeHeight} min={10} max={34} step={0.5} onChange={(value) => updateLayout({ pulseNodeHeight: value })} />
                    <NumberSetting label="胶囊圆角" value={data.layout.pulseNodeRadius} min={0} max={18} step={0.5} onChange={(value) => updateLayout({ pulseNodeRadius: value })} />
                    <NumberSetting label="本站光环大小" value={data.layout.pulseCurrentHaloSize} min={0} max={14} step={0.5} onChange={(value) => updateLayout({ pulseCurrentHaloSize: value })} />
                    <NumberSetting label="顶部信息带高度" value={data.layout.pulseHeaderHeight} min={12} max={34} step={0.5} onChange={(value) => updateLayout({ pulseHeaderHeight: value })} />
                    <NumberSetting label="换乘胶囊高度" value={data.layout.pulseTransferBadgeHeight} min={10} max={24} step={0.5} onChange={(value) => updateLayout({ pulseTransferBadgeHeight: value })} />
                    <NumberSetting label="换乘胶囊间距" value={data.layout.pulseTransferBadgeGap} min={0} max={10} step={0.5} onChange={(value) => updateLayout({ pulseTransferBadgeGap: value })} />
                    <NumberSetting label="中文站名 Y" value={data.layout.pulseStationZhY} min={70} max={112} step={0.5} onChange={(value) => updateLayout({ pulseStationZhY: value })} />
                    <NumberSetting label="英文站名 Y" value={data.layout.pulseStationEnY} min={82} max={122} step={0.5} onChange={(value) => updateLayout({ pulseStationEnY: value })} />
                  </div>
                  <div className="color-grid pulse-color-grid">
                    <ColorField label="信息面板颜色" value={data.layout.pulsePanelColor} onChange={(value) => updateLayout({ pulsePanelColor: value })} />
                    <ColorField label="轨道底层颜色" value={data.layout.pulseTrackColor} onChange={(value) => updateLayout({ pulseTrackColor: value })} />
                  </div>
                  <label className="settings-checkbox-row">
                    <input type="checkbox" checked={data.layout.pulseShowSequence} onChange={(event) => updateLayout({ pulseShowSequence: event.target.checked })} />
                    <span><b>显示顶部站点序号</b><small>关闭后保留顶部信息带，但不绘制站点编号。</small></span>
                  </label>
                </section>
              )}
              <section className="settings-section position-settings-section">
                <h3>独立组件精确位置</h3>
                <p className="settings-help position-settings-help">先在右侧选择本站、下一站、运行方向或线路标识。X/Y 使用 128×128 矢量坐标；也可以直接拖动预览中的色条、文字、箭头和标识。</p>
                {settingsPreviewMode === "current" && (
                  <>
                    <h4>本站红色条</h4>
                    <div className="settings-grid">
                      <NumberSetting label="红条 X" value={data.layout.currentAccentX} min={-32} max={160} step={0.5} onChange={(value) => updateLayout({ currentAccentX: value })} />
                      <NumberSetting label="红条 Y" value={data.layout.currentAccentY} min={-32} max={160} step={0.5} onChange={(value) => updateLayout({ currentAccentY: value })} />
                      <NumberSetting label="红条宽度" value={data.layout.currentAccentWidth} min={1} max={128} step={0.5} onChange={(value) => updateLayout({ currentAccentWidth: value })} />
                      <NumberSetting label="红条高度" value={data.layout.currentAccentHeight} min={1} max={128} step={0.5} onChange={(value) => updateLayout({ currentAccentHeight: value })} />
                    </div>
                    <h4>本站文字</h4>
                    <div className="settings-grid">
                      <NumberSetting label="“本站:”文字 X" value={data.layout.currentLabelX} min={-32} max={160} step={0.5} onChange={(value) => updateLayout({ currentLabelX: value })} />
                      <NumberSetting label="“本站:”文字 Y" value={data.layout.currentLabelY} min={-32} max={160} step={0.5} onChange={(value) => updateLayout({ currentLabelY: value })} />
                      <NumberSetting label="当前站名称 X" value={data.layout.currentStationX} min={-32} max={160} step={0.5} onChange={(value) => updateLayout({ currentStationX: value })} />
                      <NumberSetting label="当前站名称 Y" value={data.layout.currentStationY} min={-32} max={160} step={0.5} onChange={(value) => updateLayout({ currentStationY: value })} />
                    </div>
                    <button className="position-reset-button" onClick={() => {
                      const defaults = defaultLayoutForTemplate(data.activeStyleTemplate);
                      updateLayout({ currentAccentX: defaults.currentAccentX, currentAccentY: defaults.currentAccentY, currentAccentWidth: defaults.currentAccentWidth, currentAccentHeight: defaults.currentAccentHeight, currentLabelX: defaults.currentLabelX, currentLabelY: defaults.currentLabelY, currentStationX: defaults.currentStationX, currentStationY: defaults.currentStationY });
                    }}>恢复本站默认位置</button>
                  </>
                )}
                {settingsPreviewMode === "next" && (
                  <>
                    <h4>下一站色条</h4>
                    <div className="settings-grid">
                      <NumberSetting label="色条 X" value={data.layout.nextAccentX} min={-32} max={160} step={0.5} onChange={(value) => updateLayout({ nextAccentX: value })} />
                      <NumberSetting label="色条 Y" value={data.layout.nextAccentY} min={-32} max={160} step={0.5} onChange={(value) => updateLayout({ nextAccentY: value })} />
                      <NumberSetting label="色条宽度" value={data.layout.nextAccentWidth} min={1} max={128} step={0.5} onChange={(value) => updateLayout({ nextAccentWidth: value })} />
                      <NumberSetting label="色条高度" value={data.layout.nextAccentHeight} min={1} max={128} step={0.5} onChange={(value) => updateLayout({ nextAccentHeight: value })} />
                    </div>
                    <h4>下一站文字</h4>
                    <div className="settings-grid">
                      <NumberSetting label="“下一站:”文字 X" value={data.layout.nextLabelX} min={-32} max={160} step={0.5} onChange={(value) => updateLayout({ nextLabelX: value })} />
                      <NumberSetting label="“下一站:”文字 Y" value={data.layout.nextLabelY} min={-32} max={160} step={0.5} onChange={(value) => updateLayout({ nextLabelY: value })} />
                      <NumberSetting label="下一站名称 X" value={data.layout.nextStationX} min={-32} max={160} step={0.5} onChange={(value) => updateLayout({ nextStationX: value })} />
                      <NumberSetting label="下一站名称 Y" value={data.layout.nextStationY} min={-32} max={160} step={0.5} onChange={(value) => updateLayout({ nextStationY: value })} />
                    </div>
                    <button className="position-reset-button" onClick={() => {
                      const defaults = defaultLayoutForTemplate(data.activeStyleTemplate);
                      updateLayout({ nextAccentX: defaults.nextAccentX, nextAccentY: defaults.nextAccentY, nextAccentWidth: defaults.nextAccentWidth, nextAccentHeight: defaults.nextAccentHeight, nextLabelX: defaults.nextLabelX, nextLabelY: defaults.nextLabelY, nextStationX: defaults.nextStationX, nextStationY: defaults.nextStationY });
                    }}>恢复下一站默认位置</button>
                  </>
                )}
                {settingsPreviewMode === "direction" && (
                  data.activeStyleTemplate === "loop" ? (
                    <>
                      <h4>环线运行组件</h4>
                      <p className="settings-help position-settings-help">环线运行组件不使用经典样式的左右箭头和终点站名称；胶囊、线路名、环线图标及“内环/外环运行”文字均独立设置。</p>
                      <div className="settings-grid">
                        <NumberSetting label="线路胶囊中心 X" value={data.layout.loopDirectionBadgeX} min={-32} max={160} step={0.5} onChange={(value) => updateLayout({ loopDirectionBadgeX: value })} />
                        <NumberSetting label="线路胶囊顶部 Y" value={data.layout.loopDirectionBadgeY} min={-32} max={160} step={0.5} onChange={(value) => updateLayout({ loopDirectionBadgeY: value })} />
                        <NumberSetting label="线路胶囊宽度" value={data.layout.loopDirectionBadgeWidth} min={24} max={120} step={0.5} onChange={(value) => updateLayout({ loopDirectionBadgeWidth: value })} />
                        <NumberSetting label="线路胶囊高度" value={data.layout.loopDirectionBadgeHeight} min={10} max={36} step={0.5} onChange={(value) => updateLayout({ loopDirectionBadgeHeight: value })} />
                        <NumberSetting label="线路胶囊圆角" value={data.layout.loopDirectionBadgeRadius} min={0} max={18} step={0.5} onChange={(value) => updateLayout({ loopDirectionBadgeRadius: value })} />
                        <NumberSetting label="胶囊文字字号" value={data.layout.loopDirectionBadgeFontSize} min={5} max={18} step={0.5} onChange={(value) => updateLayout({ loopDirectionBadgeFontSize: value })} />
                        <NumberSetting label="线路名称 X" value={data.layout.loopDirectionLineNameX} min={-32} max={160} step={0.5} onChange={(value) => updateLayout({ loopDirectionLineNameX: value })} />
                        <NumberSetting label="线路名称 Y" value={data.layout.loopDirectionLineNameY} min={-32} max={160} step={0.5} onChange={(value) => updateLayout({ loopDirectionLineNameY: value })} />
                        <NumberSetting label="线路名称字号" value={data.layout.loopDirectionLineNameFontSize} min={6} max={24} step={0.5} onChange={(value) => updateLayout({ loopDirectionLineNameFontSize: value })} />
                        <NumberSetting label="环线图标中心 X" value={data.layout.loopDirectionIconX} min={-32} max={160} step={0.5} onChange={(value) => updateLayout({ loopDirectionIconX: value })} />
                        <NumberSetting label="环线图标顶部 Y" value={data.layout.loopDirectionIconY} min={-32} max={160} step={0.5} onChange={(value) => updateLayout({ loopDirectionIconY: value })} />
                        <NumberSetting label="环线图标大小" value={data.layout.loopDirectionIconSize} min={18} max={88} step={0.5} onChange={(value) => updateLayout({ loopDirectionIconSize: value })} />
                        <NumberSetting label="“内环/外环”文字 X" value={data.layout.loopDirectionLoopTextX} min={-32} max={160} step={0.5} onChange={(value) => updateLayout({ loopDirectionLoopTextX: value })} />
                        <NumberSetting label="“内环/外环”文字 Y" value={data.layout.loopDirectionLoopTextY} min={-32} max={160} step={0.5} onChange={(value) => updateLayout({ loopDirectionLoopTextY: value })} />
                        <NumberSetting label="“内环/外环”文字字号" value={data.layout.loopDirectionLoopTextFontSize} min={6} max={24} step={0.5} onChange={(value) => updateLayout({ loopDirectionLoopTextFontSize: value })} />
                        <NumberSetting label="“运行”文字 X" value={data.layout.loopDirectionRunTextX} min={-32} max={160} step={0.5} onChange={(value) => updateLayout({ loopDirectionRunTextX: value })} />
                        <NumberSetting label="“运行”文字 Y" value={data.layout.loopDirectionRunTextY} min={-32} max={160} step={0.5} onChange={(value) => updateLayout({ loopDirectionRunTextY: value })} />
                        <NumberSetting label="“运行”文字字号" value={data.layout.loopDirectionRunTextFontSize} min={6} max={24} step={0.5} onChange={(value) => updateLayout({ loopDirectionRunTextFontSize: value })} />
                      </div>
                      <button className="position-reset-button" onClick={() => {
                        const defaults = defaultLayoutForTemplate("loop");
                        updateLayout({
                          loopDirectionBadgeX: defaults.loopDirectionBadgeX,
                          loopDirectionBadgeY: defaults.loopDirectionBadgeY,
                          loopDirectionBadgeWidth: defaults.loopDirectionBadgeWidth,
                          loopDirectionBadgeHeight: defaults.loopDirectionBadgeHeight,
                          loopDirectionBadgeRadius: defaults.loopDirectionBadgeRadius,
                          loopDirectionBadgeFontSize: defaults.loopDirectionBadgeFontSize,
                          loopDirectionLineNameX: defaults.loopDirectionLineNameX,
                          loopDirectionLineNameY: defaults.loopDirectionLineNameY,
                          loopDirectionLineNameFontSize: defaults.loopDirectionLineNameFontSize,
                          loopDirectionIconX: defaults.loopDirectionIconX,
                          loopDirectionIconY: defaults.loopDirectionIconY,
                          loopDirectionIconSize: defaults.loopDirectionIconSize,
                          loopDirectionLoopTextX: defaults.loopDirectionLoopTextX,
                          loopDirectionLoopTextY: defaults.loopDirectionLoopTextY,
                          loopDirectionLoopTextFontSize: defaults.loopDirectionLoopTextFontSize,
                          loopDirectionRunTextX: defaults.loopDirectionRunTextX,
                          loopDirectionRunTextY: defaults.loopDirectionRunTextY,
                          loopDirectionRunTextFontSize: defaults.loopDirectionRunTextFontSize,
                        });
                      }}>恢复环线运行组件默认参数</button>
                    </>
                  ) : (
                    <>
                      <h4>箭头与文字位置</h4>
                      <div className="settings-grid">
                        <NumberSetting label="箭头 X（反向自动镜像）" value={data.layout.directionArrowX} min={-32} max={160} step={0.5} onChange={(value) => updateLayout({ directionArrowX: value })} />
                        <NumberSetting label="箭头 Y" value={data.layout.directionArrowY} min={-32} max={160} step={0.5} onChange={(value) => updateLayout({ directionArrowY: value })} />
                        <NumberSetting label="“运行方向:”文字 X" value={data.layout.directionLabelX} min={-32} max={160} step={0.5} onChange={(value) => updateLayout({ directionLabelX: value })} />
                        <NumberSetting label="“运行方向:”文字 Y" value={data.layout.directionLabelY} min={-32} max={160} step={0.5} onChange={(value) => updateLayout({ directionLabelY: value })} />
                        <NumberSetting label="终点站名称 X" value={data.layout.directionStationX} min={-32} max={160} step={0.5} onChange={(value) => updateLayout({ directionStationX: value })} />
                        <NumberSetting label="终点站名称 Y" value={data.layout.directionStationY} min={-32} max={160} step={0.5} onChange={(value) => updateLayout({ directionStationY: value })} />
                      </div>
                      {data.activeStyleTemplate === "scenic" && (
                        <>
                          <h4>景区方向横条</h4>
                          <div className="settings-grid">
                            <NumberSetting label="方向横条高度" value={data.layout.scenicDirectionBarHeight} min={2} max={18} step={0.5} onChange={(value) => updateLayout({ scenicDirectionBarHeight: value })} />
                            <NumberSetting label="方向横条 Y" value={data.layout.scenicDirectionBarY} min={20} max={90} step={0.5} onChange={(value) => updateLayout({ scenicDirectionBarY: value })} />
                          </div>
                        </>
                      )}
                      <button className="position-reset-button" onClick={() => {
                        const defaults = defaultLayoutForTemplate(data.activeStyleTemplate);
                        updateLayout({
                          directionArrowX: defaults.directionArrowX,
                          directionArrowY: defaults.directionArrowY,
                          directionLabelX: defaults.directionLabelX,
                          directionLabelY: defaults.directionLabelY,
                          directionStationX: defaults.directionStationX,
                          directionStationY: defaults.directionStationY,
                          ...(data.activeStyleTemplate === "scenic" ? {
                            scenicDirectionBarHeight: defaults.scenicDirectionBarHeight,
                            scenicDirectionBarY: defaults.scenicDirectionBarY,
                          } : {}),
                        });
                      }}>恢复运行方向默认位置</button>
                    </>
                  )
                )}
                {settingsPreviewMode === "badge" && (
                  <>
                    <h4>标识框与文字位置</h4>
                    <div className="settings-grid">
                      <NumberSetting label="标识框中心 X" value={data.layout.lineBadgeX} min={-32} max={160} step={0.5} onChange={(value) => updateLayout({ lineBadgeX: value })} />
                      <NumberSetting label="标识框顶部 Y" value={data.layout.lineBadgeY} min={-32} max={160} step={0.5} onChange={(value) => updateLayout({ lineBadgeY: value })} />
                      <NumberSetting label="线路编号 X" value={data.layout.lineBadgeNumberX} min={-32} max={160} step={0.5} onChange={(value) => updateLayout({ lineBadgeNumberX: value })} />
                      <NumberSetting label="线路编号 Y" value={data.layout.lineBadgeNumberY} min={-32} max={160} step={0.5} onChange={(value) => updateLayout({ lineBadgeNumberY: value })} />
                      <NumberSetting label="线路英文 X" value={data.layout.lineBadgeEnglishX} min={-32} max={160} step={0.5} onChange={(value) => updateLayout({ lineBadgeEnglishX: value })} />
                      <NumberSetting label="线路英文 Y" value={data.layout.lineBadgeEnglishY} min={-32} max={160} step={0.5} onChange={(value) => updateLayout({ lineBadgeEnglishY: value })} />
                      <NumberSetting label="线路说明 X" value={data.layout.lineBadgeDescriptionX} min={-32} max={160} step={0.5} onChange={(value) => updateLayout({ lineBadgeDescriptionX: value })} />
                      <NumberSetting label="线路说明 Y" value={data.layout.lineBadgeDescriptionY} min={-32} max={160} step={0.5} onChange={(value) => updateLayout({ lineBadgeDescriptionY: value })} />
                    </div>
                    <button className="position-reset-button" onClick={() => {
                      const defaults = defaultLayoutForTemplate(data.activeStyleTemplate);
                      updateLayout({ lineBadgeX: defaults.lineBadgeX, lineBadgeY: defaults.lineBadgeY, lineBadgeNumberX: defaults.lineBadgeNumberX, lineBadgeNumberY: defaults.lineBadgeNumberY, lineBadgeEnglishX: defaults.lineBadgeEnglishX, lineBadgeEnglishY: defaults.lineBadgeEnglishY, lineBadgeDescriptionX: defaults.lineBadgeDescriptionX, lineBadgeDescriptionY: defaults.lineBadgeDescriptionY });
                    }}>恢复线路标识默认位置</button>
                  </>
                )}
                {settingsPreviewMode === "station" && <div className="position-settings-empty">{data.activeStyleTemplate === "scenic" ? "景区站点沿用下方“景区站点与横条”“换乘箭头”和“文字”设置；切换到其他预览可调整独立组件坐标。" : "线路站点沿用下方“站点与横条”“换乘箭头”和“文字”设置；切换到其他预览可调整独立组件坐标。"}</div>}
              </section>
              <section className="settings-section">
                <h3>{data.activeStyleTemplate === "scenic" ? "景区站点与横条" : "站点与横条"}</h3>
                {data.activeStyleTemplate === "scenic" ? (
                  <>
                    <p className="settings-help">景区样式使用圆角矩形站点，中间填充图标；横条为主题色贯穿的细横线。</p>
                    <div className="settings-grid">
                      <NumberSetting label="矩形宽度" value={data.layout.scenicStationRectWidth} min={16} max={100} step={0.5} onChange={(value) => updateLayout({ scenicStationRectWidth: value })} />
                      <NumberSetting label="矩形高度" value={data.layout.scenicStationRectHeight} min={16} max={80} step={0.5} onChange={(value) => updateLayout({ scenicStationRectHeight: value })} />
                      <NumberSetting label="矩形圆角" value={data.layout.scenicStationRectRadius} min={0} max={16} step={0.5} onChange={(value) => updateLayout({ scenicStationRectRadius: value })} />
                      <NumberSetting label="矩形边框粗细" value={data.layout.scenicStationRectBorderWidth} min={1} max={6} step={0.5} onChange={(value) => updateLayout({ scenicStationRectBorderWidth: value })} />
                      <NumberSetting label="图标大小" value={data.layout.scenicStationIconSize} min={8} max={64} step={0.5} onChange={(value) => updateLayout({ scenicStationIconSize: value })} />
                      <NumberSetting label="图标内边距" value={data.layout.scenicStationIconPadding} min={0} max={10} step={0.5} onChange={(value) => updateLayout({ scenicStationIconPadding: value })} />
                      <NumberSetting label="中文站名 Y" value={data.layout.scenicStationZhY} min={0} max={120} step={0.5} onChange={(value) => updateLayout({ scenicStationZhY: value })} />
                      <NumberSetting label="英文站名 Y" value={data.layout.scenicStationEnY} min={0} max={120} step={0.5} onChange={(value) => updateLayout({ scenicStationEnY: value })} />
                      <NumberSetting label="横条高度" value={data.layout.scenicBarHeight} min={2} max={18} step={0.5} onChange={(value) => updateLayout({ scenicBarHeight: value })} />
                      <NumberSetting label="横条 Y" value={data.layout.scenicBarY} min={20} max={90} step={0.5} onChange={(value) => updateLayout({ scenicBarY: value })} />
                    </div>
                    <button className="position-reset-button" onClick={() => {
                      const defaults = defaultLayoutForTemplate("scenic");
                      updateLayout({
                        scenicStationRectWidth: defaults.scenicStationRectWidth,
                        scenicStationRectHeight: defaults.scenicStationRectHeight,
                        scenicStationRectRadius: defaults.scenicStationRectRadius,
                        scenicStationRectBorderWidth: defaults.scenicStationRectBorderWidth,
                        scenicStationIconSize: defaults.scenicStationIconSize,
                        scenicStationIconPadding: defaults.scenicStationIconPadding,
                        scenicStationZhY: defaults.scenicStationZhY,
                        scenicStationEnY: defaults.scenicStationEnY,
                        scenicBarHeight: defaults.scenicBarHeight,
                        scenicBarY: defaults.scenicBarY,
                      });
                    }}>恢复景区站点默认参数</button>
                  </>
                ) : (
                  <>
                    <div className="settings-grid">
                      <NumberSetting label="圆环大小" value={data.layout.stationRadius} min={8} max={22} onChange={(value) => updateLayout({ stationRadius: value })} />
                      <NumberSetting label="圆环厚度" value={data.layout.stationRingWidth} min={2} max={9} step={0.5} onChange={(value) => updateLayout({ stationRingWidth: value })} />
                      <NumberSetting label="横条粗细" value={data.layout.lineWidth} min={2} max={14} step={0.5} onChange={(value) => updateLayout({ lineWidth: value })} />
                    </div>
                    <label className="display-toggle">
                      <input type="checkbox" checked={data.layout.showStationCenterCodes} onChange={(event) => updateLayout({ showStationCenterCodes: event.target.checked })} />
                      <span><b>圆环内显示线路代号和站点代号</b><small>按站点代号的分隔符拆分，例如 L4-01 显示为上方 L4、下方 01；已过站自动改为已过站颜色。</small></span>
                    </label>
                    {data.layout.showStationCenterCodes && (
                      <div className="settings-grid station-center-code-settings">
                        <NumberSetting label="线路编号字号" value={data.layout.stationCenterLineFontSize} min={4} max={12} step={0.5} onChange={(value) => updateLayout({ stationCenterLineFontSize: value })} />
                        <NumberSetting label="站序号字号" value={data.layout.stationCenterSequenceFontSize} min={4} max={12} step={0.5} onChange={(value) => updateLayout({ stationCenterSequenceFontSize: value })} />
                        <NumberSetting label="圆环内字符间距" value={data.layout.stationCenterLetterSpacing} min={-1} max={4} step={0.25} onChange={(value) => updateLayout({ stationCenterLetterSpacing: value })} />
                        <NumberSetting label="中间分隔线宽度" value={data.layout.stationCenterDividerWidth} min={5} max={24} step={0.5} onChange={(value) => updateLayout({ stationCenterDividerWidth: value })} />
                      </div>
                    )}
                  </>
                )}
                <label className="display-toggle">
                  <input type="checkbox" checked={data.layout.closedStationsUsePassedColor} onChange={(event) => updateLayout({ closedStationsUsePassedColor: event.target.checked })} />
                  <span><b>未开通站点按已过站配色</b><small>只替换站点、相邻横条及换乘标识的显示颜色；站点状态、位置、文字和导出结构不变。</small></span>
                </label>
              </section>
              {data.activeStyleTemplate === "loop" ? <section className="settings-section">
                <h3>环线换乘标识</h3>
                <p className="settings-help position-settings-help">环线样式使用带白色换乘图标的线路色胶囊，不显示经典样式的向上箭头。</p>
                <div className="settings-grid">
                  <NumberSetting label="换乘胶囊高度" value={data.layout.loopTransferBadgeHeight} min={12} max={24} step={0.5} onChange={(value) => updateLayout({ loopTransferBadgeHeight: value })} />
                  <NumberSetting label="换乘线路字号" value={data.layout.loopTransferBadgeFontSize} min={6} max={13} step={0.5} onChange={(value) => updateLayout({ loopTransferBadgeFontSize: value })} />
                  <NumberSetting label="多个换乘标识间距" value={data.layout.loopTransferBadgeGap} min={0} max={10} step={0.5} onChange={(value) => updateLayout({ loopTransferBadgeGap: value })} />
                </div>
              </section> : <section className="settings-section">
                <h3>换乘箭头</h3>
                <p className="settings-help position-settings-help">{data.activeStyleTemplate === "scenic" ? "景区样式的换乘箭头从矩形站点上缘向上延伸，参数与经典样式独立存储。" : "经典样式使用向上的三角箭头标识换乘线路。"}</p>
                <div className="settings-grid">
                  <NumberSetting label="箭头大小（头部宽度）" value={data.layout.transferArrowHeadWidth} min={10} max={28} step={0.5} onChange={(value) => updateLayout({ transferArrowHeadWidth: value })} />
                  <NumberSetting label="箭头长度" value={data.layout.transferArrowLength} min={14} max={34} step={0.5} onChange={(value) => updateLayout({ transferArrowLength: value })} />
                  <NumberSetting label="箭头粗细（杆宽）" value={data.layout.transferArrowStemWidth} min={3} max={12} step={0.5} onChange={(value) => updateLayout({ transferArrowStemWidth: value })} />
                  <NumberSetting label="电车标识上下偏移" value={data.layout.tramTransferVerticalOffset} min={-16} max={16} step={0.5} onChange={(value) => updateLayout({ tramTransferVerticalOffset: value })} />
                </div>
              </section>}
              <section className="settings-section">
                <h3>文字</h3>
                <div className="settings-grid">
                  <NumberSetting label="中文站名字号" value={data.layout.stationZhFontSize} min={8} max={24} step={0.5} onChange={(value) => updateLayout({ stationZhFontSize: value })} />
                  <NumberSetting label="中文站名字符间距" value={data.layout.stationZhLetterSpacing} min={-2} max={8} step={0.25} onChange={(value) => updateLayout({ stationZhLetterSpacing: value })} />
                  <NumberSetting label="英文站名字号" value={data.layout.stationEnFontSize} min={5} max={14} step={0.5} onChange={(value) => updateLayout({ stationEnFontSize: value })} />
                  <NumberSetting label="英文站名字符间距" value={data.layout.stationEnLetterSpacing} min={-2} max={8} step={0.25} onChange={(value) => updateLayout({ stationEnLetterSpacing: value })} />
                  <NumberSetting label="英文自动缩放下限" value={data.layout.stationEnMinFontSize} min={3} max={10} step={0.5} onChange={(value) => updateLayout({ stationEnMinFontSize: value })} />
                  <NumberSetting label="地铁换乘线路字号" value={data.layout.transferFontSize} min={8} max={22} step={0.5} onChange={(value) => updateLayout({ transferFontSize: value })} />
                  <NumberSetting label="地铁换乘字符间距" value={data.layout.transferLetterSpacing} min={-2} max={8} step={0.25} onChange={(value) => updateLayout({ transferLetterSpacing: value })} />
                  <NumberSetting label="电车换乘字号" value={data.layout.tramTransferFontSize} min={6} max={14} step={0.5} onChange={(value) => updateLayout({ tramTransferFontSize: value })} />
                  <NumberSetting label="电车换乘字符间距" value={data.layout.tramTransferLetterSpacing} min={-2} max={8} step={0.25} onChange={(value) => updateLayout({ tramTransferLetterSpacing: value })} />
                </div>
                <div className="font-settings">
                  <label><span>中文字体</span><input value={data.layout.fontZh} onChange={(event) => updateLayout({ fontZh: event.target.value })} /></label>
                  <label><span>英文字体</span><input value={data.layout.fontEn} onChange={(event) => updateLayout({ fontEn: event.target.value })} /></label>
                </div>
                <p className="settings-help">中文站名始终保持一行并在过长时缩小；英文站名优先一行，过长时自动排为两行，再按需要缩小字号。</p>
              </section>
              <section className="settings-section">
                <h3>本站与下一站图片</h3>
                <div className="settings-grid">
                  <NumberSetting label="本站/下一站标题字号" value={data.layout.infoLabelFontSize} min={10} max={28} step={0.5} onChange={(value) => updateLayout({ infoLabelFontSize: value })} />
                  <NumberSetting label="标题字符间距" value={data.layout.infoLabelLetterSpacing} min={-2} max={8} step={0.25} onChange={(value) => updateLayout({ infoLabelLetterSpacing: value })} />
                  <NumberSetting label="站点名称字号" value={data.layout.infoStationFontSize} min={10} max={30} step={0.5} onChange={(value) => updateLayout({ infoStationFontSize: value })} />
                  <NumberSetting label="站点名称字符间距" value={data.layout.infoStationLetterSpacing} min={-2} max={8} step={0.25} onChange={(value) => updateLayout({ infoStationLetterSpacing: value })} />
                </div>
              </section>
              {data.activeStyleTemplate !== "loop" && <section className="settings-section">
                <h3>运行方向图片</h3>
                <p className="settings-help position-settings-help">{data.activeStyleTemplate === "scenic" ? "景区样式的运行方向使用贯穿画幅的主题色横条，白色箭头位于横条上方。" : "经典样式的运行方向使用线路色箭头指向终点站。"}</p>
                <div className="settings-grid">
                  <NumberSetting label="方向箭头横杆长度" value={data.layout.directionArrowShaftLength} min={28} max={60} step={0.5} onChange={(value) => updateLayout({ directionArrowShaftLength: value })} />
                  <NumberSetting label="方向箭头粗细" value={data.layout.directionArrowThickness} min={6} max={24} step={0.5} onChange={(value) => updateLayout({ directionArrowThickness: value })} />
                  <NumberSetting label="方向箭头头部长度" value={data.layout.directionArrowHeadLength} min={18} max={45} step={0.5} onChange={(value) => updateLayout({ directionArrowHeadLength: value })} />
                  <NumberSetting label="方向箭头头部宽度" value={data.layout.directionArrowHeadWidth} min={25} max={70} step={0.5} onChange={(value) => updateLayout({ directionArrowHeadWidth: value })} />
                  <NumberSetting label="方向箭头轮廓粗细" value={data.layout.directionArrowOutlineWidth} min={0} max={8} step={0.5} onChange={(value) => updateLayout({ directionArrowOutlineWidth: value })} />
                  <NumberSetting label="运行方向标题字号" value={data.layout.directionLabelFontSize} min={8} max={20} step={0.5} onChange={(value) => updateLayout({ directionLabelFontSize: value })} />
                  <NumberSetting label="运行方向标题字符间距" value={data.layout.directionLabelLetterSpacing} min={-2} max={8} step={0.25} onChange={(value) => updateLayout({ directionLabelLetterSpacing: value })} />
                  <NumberSetting label="终点站名字号" value={data.layout.directionStationFontSize} min={10} max={28} step={0.5} onChange={(value) => updateLayout({ directionStationFontSize: value })} />
                  <NumberSetting label="终点站名字符间距" value={data.layout.directionStationLetterSpacing} min={-2} max={8} step={0.25} onChange={(value) => updateLayout({ directionStationLetterSpacing: value })} />
                </div>
              </section>}
              <section className="settings-section">
                <h3>线路标识图片</h3>
                <div className="settings-grid">
                  <NumberSetting label="标识宽度" value={data.layout.lineBadgeWidth} min={70} max={118} step={1} onChange={(value) => updateLayout({ lineBadgeWidth: value })} />
                  <NumberSetting label="标识高度" value={data.layout.lineBadgeHeight} min={38} max={72} step={1} onChange={(value) => updateLayout({ lineBadgeHeight: value })} />
                  <NumberSetting label="标识圆角" value={data.layout.lineBadgeRadius} min={2} max={20} step={0.5} onChange={(value) => updateLayout({ lineBadgeRadius: value })} />
                  <NumberSetting label="线路编号字号" value={data.layout.lineBadgeNumberFontSize} min={18} max={36} step={0.5} onChange={(value) => updateLayout({ lineBadgeNumberFontSize: value })} />
                  <NumberSetting label="线路编号字符间距" value={data.layout.lineBadgeNumberLetterSpacing} min={-2} max={8} step={0.25} onChange={(value) => updateLayout({ lineBadgeNumberLetterSpacing: value })} />
                  <NumberSetting label="线路英文字号" value={data.layout.lineBadgeEnglishFontSize} min={7} max={16} step={0.5} onChange={(value) => updateLayout({ lineBadgeEnglishFontSize: value })} />
                  <NumberSetting label="线路英文字符间距" value={data.layout.lineBadgeEnglishLetterSpacing} min={-2} max={8} step={0.25} onChange={(value) => updateLayout({ lineBadgeEnglishLetterSpacing: value })} />
                  <NumberSetting label="线路说明字号" value={data.layout.lineBadgeDescriptionFontSize} min={8} max={20} step={0.5} onChange={(value) => updateLayout({ lineBadgeDescriptionFontSize: value })} />
                  <NumberSetting label="线路说明字符间距" value={data.layout.lineBadgeDescriptionLetterSpacing} min={-2} max={8} step={0.25} onChange={(value) => updateLayout({ lineBadgeDescriptionLetterSpacing: value })} />
                </div>
              </section>
              <section className="settings-section compact-settings">
                <h3>其他可调项目</h3>
                <div className="other-settings">
                  <ColorField label="画布背景色" value={data.layout.background} onChange={(value) => updateLayout({ background: value })} />
                  <p>线路颜色、已过/当前/未到站颜色可在线路编辑中设置；单站颜色与单条换乘显示状态可在站点编辑中设置；透明背景、预览缩放和导出分辨率位于预览顶部。</p>
                </div>
              </section>
              </div>
              <aside className="settings-preview-panel" aria-label="显示设置实时预览">
                <div className="settings-preview-heading">
                  <div>
                    <span>实时预览</span>
                    <select aria-label="选择设置预览站点" value={currentIndex} onChange={(event) => setCurrentIndex(Number(event.target.value))} disabled={!stations.length}>
                      {stations.map((station, index) => (
                        <option key={station.id} value={index}>{station.sequence}. {stationOptionLabel(station, line)}{data.transfers.some((transfer) => transfer.stationId === station.id && !transfer.hidden) ? " · 换乘站" : ""}</option>
                      ))}
                    </select>
                  </div>
                  <i>{{ station: "线路站点", current: "本站", next: "下一站", direction: "运行方向", badge: "线路标识" }[settingsPreviewMode]}</i>
                </div>
                <div className="settings-preview-tabs" aria-label="选择组件预览">
                  {([
                    ["station", "线路站点"],
                    ["current", "本站"],
                    ["next", "下一站"],
                    ["direction", "运行方向"],
                    ["badge", "线路标识"],
                  ] as const).map(([mode, label]) => (
                    <button key={mode} className={settingsPreviewMode === mode ? "active" : ""} onClick={() => setSettingsPreviewMode(mode)}>{label}</button>
                  ))}
                </div>
                <div className={`settings-preview-stage ${transparent ? "transparent-grid" : ""}`}>
                  {line && currentStation ? (
                    data.activeStyleTemplate === "scenic" ? (
                      settingsPreviewMode === "station" ? (
                        <ScenicStationPreviewSvg data={data} line={line} station={currentStation} direction={visualDirection} transparent={transparent} assetsReady={scenicAssetsReady} />
                      ) : settingsPreviewMode === "current" ? (
                        <ScenicTextCardPreviewSvg data={data} line={line} station={currentStation} kind="current" transparent={transparent} assetsReady={scenicAssetsReady} />
                      ) : settingsPreviewMode === "next" ? (
                        nextStation
                          ? <ScenicTextCardPreviewSvg data={data} line={line} station={nextStation} kind="next" transparent={transparent} assetsReady={scenicAssetsReady} />
                          : <span>当前运行方向已到终点，没有下一站</span>
                      ) : settingsPreviewMode === "direction" ? (
                        <ScenicDirectionPreviewSvg
                          data={data}
                          line={line}
                          station={terminusForDirection(stations, direction)}
                          side={terminusSideFor(direction, platformType)}
                          transparent={transparent}
                          onLayoutChange={updateLayout}
                        />
                      ) : (
                        <ScenicLineBadgePreviewSvg data={data} line={line} transparent={transparent} />
                      )
                    ) : (
                      settingsPreviewMode === "station" ? (
                        <StationPreviewSvg data={data} line={line} station={currentStation} direction={visualDirection} transparent={transparent} />
                      ) : settingsPreviewMode === "current" ? (
                        <TextCardPreviewSvg data={data} line={line} station={currentStation} kind="current" transparent={transparent} onLayoutChange={updateLayout} />
                      ) : settingsPreviewMode === "next" ? (
                        nextStation
                          ? <TextCardPreviewSvg data={data} line={line} station={nextStation} kind="next" transparent={transparent} onLayoutChange={updateLayout} />
                          : <span>当前运行方向已到终点，没有下一站</span>
                      ) : settingsPreviewMode === "direction" ? (
                        <DirectionPreviewSvg
                          data={data}
                          line={line}
                          station={terminusForDirection(stations, direction)}
                          side={terminusSideFor(direction, platformType)}
                          direction={direction}
                          transparent={transparent}
                          onLayoutChange={updateLayout}
                        />
                      ) : (
                        <LineBadgePreviewSvg data={data} line={line} transparent={transparent} onLayoutChange={updateLayout} />
                      )
                    )
                  ) : (
                    <span>当前线路暂无站点</span>
                  )}
                </div>
                <p>可切换查看线路站点、本站、下一站和独立组件；独立组件中的元素可直接拖动，参数修改会即时反映到预览与导出图片。</p>
              </aside>
            </div>
            <div className="modal-actions">
              <button className="secondary-button" onClick={() => updateLayout({ ...defaultLayoutForTemplate(data.activeStyleTemplate) })}>恢复当前模板默认参数</button>
              <div className="toolbar-spacer" />
              <button className="secondary-button" onClick={undo} disabled={!undoStack.length}>撤销修改</button>
              <button className="primary-button" onClick={() => void saveLayout()} disabled={!layoutDirty}>{layoutDirty ? "保存显示设置" : "显示设置已保存"}</button>
              <button className="secondary-button" onClick={() => onClose()}>完成</button>
            </div>
          </section>
        </div>
  );
}
