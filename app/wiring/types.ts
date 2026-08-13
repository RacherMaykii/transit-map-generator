// ──────────────────────────────────────────────
// 配线图编辑器 · 领域类型定义
// ──────────────────────────────────────────────

/** 编辑器工具模式 */
export type WiringTool = "select" | "pan" | "place" | "label" | "connect" | "auto" | "shape";

/** 元件库矢量图形类型：基础形状 + 工程图标（信号机） */
export type GraphicShapeType =
  | "rect"
  | "roundRect"
  | "triangle"
  | "circle"
  | "diamond"
  | "signal-in"
  | "signal-out"
  | "signal-shunt";

/** 模块端口角色 */
export type PortRole = "up_main" | "down_main" | "siding" | "yard" | "branch";

/** 端口朝向 */
export type PortSide = "left" | "right" | "top" | "bottom";

/** 轨道类型 */
export type TrackType =
  | "main"
  | "station"
  | "siding"
  | "turnback"
  | "yard"
  | "depot"
  | "branch";

/** 模板分类 */
export type TemplateCategory = "section" | "turnout" | "yard";

/** 模板可配置参数 */
export interface TemplateParam {
  key: string;
  label: string;
  min: number;
  max: number;
  default: number;
  step?: number;
  unit?: string; // "px" | "°"
}

/** 轨道交叉类型 */
export type CrossingType = "plain" | "gap" | "bridge";

/** 站台类型 */
export type PlatformType = "side" | "island" | "double_island" | "spanish";

/** 标签锚点方向 */
export type LabelAnchor =
  | "top"
  | "bottom"
  | "left"
  | "right"
  | "top_left"
  | "top_right"
  | "bottom_left"
  | "bottom_right";

/** 左侧面板标签页 */
export type LeftPanelTab = "library" | "data" | "layers";

// ── 模板几何元素 ──────────────────────────────

/** 模板内的轨道段（局部坐标） */
export interface TemplateTrack {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  type: TrackType;
  /** 是否为弧线 */
  curved?: boolean;
  /** 弧线控制点 */
  cx?: number;
  cy?: number;
  /** 三次贝塞尔曲线的第二控制点；省略时使用二次曲线。 */
  cx2?: number;
  cy2?: number;
}

/** 模板内的站台形状 */
export interface TemplatePlatform {
  x: number;
  y: number;
  width: number;
  height: number;
  type: PlatformType;
  label?: string;
}

/** 模板内的文字标签 */
export interface TemplateLabel {
  x: number;
  y: number;
  text: string;
  fontSize?: number;
  anchor?: "start" | "middle" | "end";
  fill?: string;
}

/** 模块连接端口 */
export interface ModulePort {
  id: string;
  name: string;
  side: PortSide;
  role: PortRole;
  x: number;
  y: number;
  /** 方向角度（0=右, 90=下, 180=左, 270=上） */
  direction: number;
}

// ── 模板定义 ──────────────────────────────────

/** 配线图模块模板 */
export interface ModuleTemplate {
  id: string;
  name: string;
  category: TemplateCategory;
  categoryName: string;
  width: number;
  height: number;
  ports: ModulePort[];
  tracks: TemplateTrack[];
  platforms: TemplatePlatform[];
  labels: TemplateLabel[];
  description: string;
  /** 可配置参数定义（如道岔长度、开口幅度、线路间距） */
  params?: TemplateParam[];
  /**
   * 逐轨线路映射：第 i 条轨道属于第几号线（0-based），按 lineIds 顺序取值。
   * 缺省时按轨道自上下分组（groupTrackColors）。
   * 同台换乘（cross_platform）用 [0,1,1,0]：A上/B上/B下/A下。
   */
  trackLinePattern?: number[];
}

// ── 画布对象 ──────────────────────────────────

/** 画布中已放置的模块实例 */
export interface DiagramModule {
  id: string;
  templateId: string;
  name: string;
  x: number;
  y: number;
  rotation: number;
  /** 水平镜像（左右翻转，绕模块中心）。与旋转组合时先在模块局部坐标翻转再旋转。 */
  mirrorX?: boolean;
  /** 垂直镜像（上下翻转，绕模块中心）。 */
  mirrorY?: boolean;
  lineIds: string[];
  sourceStationIds: string[];
  locked: boolean;
  layerId: string;
  zIndex: number;
  /** 所属画布页；旧工程缺省时归入 page-1 */
  pageId?: string;
  createdOrder?: number;
  /** 用户自定义标签（覆盖模板默认） */
  customLabel?: string;
  /** 自定义模板参数值（key→当前值），如 { length: 100, branchOffset: 28 } */
  customParams?: Record<string, number>;
  /** 在站点模块内部增加避让线；不新增或改变模块对外端口。 */
  avoidanceTracks?: boolean;
  /** Whether this module's small auxiliary template annotations are visible. */
  showAuxLabels?: boolean;
  /** 模块内部轨道的着色方式：default=默认深灰 / line=跟随线路颜色 / manual=手动指定 */
  trackColorMode?: "default" | "line" | "manual";
  /** 手动轨道颜色（trackColorMode === "manual" 时生效） */
  trackColor?: string;
  /** 模块内嵌站名标签的着色方式：default=默认深灰 / line=跟随线路颜色 */
  labelColorMode?: "default" | "line";
}

/** 模块间的连接 */
export interface ModuleConnection {
  id: string;
  fromModuleId: string;
  fromPortId: string;
  toModuleId: string;
  toPortId: string;
  /** 连接轨道段（世界坐标） */
  tracks: TemplateTrack[];
  /** 轨道交叉类型：plain=平面交叉 / gap=断开 / bridge=桥梁跨越 */
  crossingType: CrossingType;
  /** 轨道线型：solid=实线（在用轨道）/ dashed=虚线（预留段、未开通段、地下隧道段等） */
  lineStyle?: "solid" | "dashed";
  /** 交叉点位置列表（世界坐标，用于渲染 gap/bridge 标记） */
  crossingPoints: CrossingPoint[];
  /** 语义化轨道控制点（沿连接插入的可编辑顶点；为空时使用 tracks 直线） */
  controlPoints: TrackControlPoint[];
  /** 是否启用自动贝塞尔曲线控制点（false 时新连接不自动生成，手动拖移后自动关闭） */
  autoCurve?: boolean;
  /** The other rail in a double-track interval. Paired curve edits mirror across the two endpoint frames. */
  pairedConnectionId?: string;
  /** 连接轨道着色方式：auto=自动跟随两端站点颜色 / manual=手动指定 */
  colorMode?: "auto" | "manual";
  /** 手动颜色覆盖（colorMode === "manual" 时生效） */
  color?: string;
  /** 连接所属画布页 */
  pageId?: string;
  /** 连接在所属图层中的显示顺序 */
  layerId: string;
  /** auto=动态取两端模块 zIndex 的中间值 / manual=使用本对象 zIndex */
  zIndexMode?: "auto" | "manual";
  zIndex: number;
  createdOrder?: number;
}

/** 轨道交叉点 */
export interface CrossingPoint {
  /** 交叉点在世界坐标中的 X */
  x: number;
  /** 交叉点在世界坐标中的 Y */
  y: number;
  /** 交叉点在轨道段参数 t (0-1)，表示从 from 到 to 的比例位置 */
  t: number;
}

/**
 * 轨道控制点（语义化轨道模型）
 *
 * 沿连接轨道插入的可编辑顶点，支持贝塞尔曲率手柄。
 * 多个控制点串联构成 TrackNode/TrackEdge 语义图：
 * - 节点（TrackNode）= 控制点本身
 * - 边（TrackEdge）= 相邻节点间的轨道段（直线或二次贝塞尔曲线）
 */
export interface TrackControlPoint {
  /** 唯一 ID */
  id: string;
  /** 世界坐标 X */
  x: number;
  /** 世界坐标 Y */
  y: number;
  /** 是否启用曲率（true 时使用 handleX/handleY 生成二次贝塞尔曲线） */
  curved: boolean;
  /** 曲率控制柄 X 偏移量（相对节点；curved=true 时生效） */
  handleX: number;
  /** 曲率控制柄 Y 偏移量（相对节点；curved=true 时生效） */
  handleY: number;
  /** 隐式锚点（靠近端口，自动生成，不可直接编辑） */
  implicit?: boolean;
  /**
   * The point stores a tangent direction only. Its visible handle is a guide;
   * each adjacent Bezier segment derives a safe local handle length at render
   * time, so moving a point close to a station cannot create an overshoot.
   */
  directionOnly?: boolean;
  /** Tangent angle in world-space degrees when directionOnly is enabled. */
  tangentDirection?: number;
  /** Explicit automatic curve primitive. Omitted points use the cubic solver. */
  curveKind?: "quadratic";
}

/** 站台对象 */
export interface PlatformObject {
  id: string;
  /** Optional module owner. Omit for a free-standing, independently editable platform. */
  moduleId?: string;
  sourceStationId?: string;
  sourceLineId?: string;
  platformType: PlatformType;
  attachedTrackIds: string[];
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  fill: string;
  label?: string;
  layerId: string;
  /** auto=跟随所属模块层级 / manual=使用本对象 zIndex */
  zIndexMode?: "auto" | "manual";
  zIndex: number;
  pageId?: string;
  createdOrder?: number;
  locked?: boolean;
  visible?: boolean;
  /** 站台填充着色方式：default=使用 fill 字段 / line=跟随所属模块的线路颜色 */
  colorMode?: "default" | "line";
}

/** A graphic which can be positioned independently or attached to a diagram object. */
export interface AttachedGraphic {
  id: string;
  /** 图片资源 id；矢量形状（shapeType）时可为空 */
  assetId?: string;
  /** 矢量形状类型：设置后按形状渲染，忽略图片资源 */
  shapeType?: GraphicShapeType;
  /** 形状填充色（图片图形不使用） */
  fill?: string;
  /** 形状描边色（图片图形不使用） */
  stroke?: string;
  attachedToId?: string;
  positionMode: "attached" | "independent";
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  /** 水平镜像（绕图形中心左右翻转）。 */
  mirrorX?: boolean;
  /** 垂直镜像（绕图形中心上下翻转）。 */
  mirrorY?: boolean;
  opacity: number;
  layerId: string;
  zIndex: number;
  pageId?: string;
  offsetX: number;
  offsetY: number;
  locked?: boolean;
  visible?: boolean;
  createdOrder?: number;
}

/** Metadata for a binary asset. `dataUrl` is used by the browser; `archivePath` by metroproj. */
export interface AssetRecord {
  id: string;
  name: string;
  mimeType: string;
  dataUrl?: string;
  archivePath?: string;
  size?: number;
  missing?: boolean;
}

/** 文字标签对象 */
export interface LabelObject {
  id: string;
  text: string;
  x: number;
  y: number;
  fontSize: number;
  anchor: LabelAnchor;
  rotation: number;
  fill: string;
  fontWeight: number;
  /** 背景遮罩：白色描边 halo 效果，使文字在复杂背景上可读 */
  backgroundMask: boolean;
  /** 描边宽度（halo 效果时） */
  maskStrokeWidth: number;
  /** 文字描边颜色；旧工程缺省为白色。 */
  outlineColor?: string;
  /** 是否绘制文字后方的实色背景。 */
  backgroundEnabled?: boolean;
  /** 文字背景颜色。 */
  backgroundColor?: string;
  /** 文字背景相对估算文字边界的内边距。 */
  backgroundPadding?: number;
  locked: boolean;
  visible: boolean;
  layerId: string;
  zIndex: number;
  pageId?: string;
  createdOrder?: number;
  attachedToId?: string;
  positionMode?: "attached" | "independent";
  offsetX?: number;
  offsetY?: number;
  sourceStationId?: string;
  language?: "zh" | "en" | "neutral";
  /** 编号标注类型：track=股道编号（渲染加"道"）、switch=道岔编号（渲染加"#"）；text 仅存纯数字 */
  numeralType?: "track" | "switch";
  /** 标签着色方式：default=使用 fill / line=跟随附着模块的线路颜色 */
  colorMode?: "default" | "line";
  /** 独立文字跟随的线路；不要求附着到站台模块。 */
  sourceLineId?: string;
}

/** 标签锚点 → SVG text-anchor / dominantBaseline 映射 */
export const LABEL_ANCHOR_MAP: Record<LabelAnchor, { textAnchor: "start" | "middle" | "end"; dominantBaseline: "middle" | "text-after-edge" | "hanging" }> = {
  top:          { textAnchor: "middle", dominantBaseline: "text-after-edge" },
  bottom:       { textAnchor: "middle", dominantBaseline: "hanging" },
  left:         { textAnchor: "end",    dominantBaseline: "middle" },
  right:        { textAnchor: "start", dominantBaseline: "middle" },
  top_left:     { textAnchor: "end",    dominantBaseline: "text-after-edge" },
  top_right:    { textAnchor: "start", dominantBaseline: "text-after-edge" },
  bottom_left:  { textAnchor: "end",    dominantBaseline: "hanging" },
  bottom_right: { textAnchor: "start", dominantBaseline: "hanging" },
};

/** 背景图对象（用于描图参考） */
export interface BackgroundImageObject {
  id: string;
  /** data URL 或图片 URL */
  src: string;
  /** 图片名称 */
  name: string;
  /** 世界坐标 X（左上角） */
  x: number;
  /** 世界坐标 Y（左上角） */
  y: number;
  /** 原始宽度 */
  naturalWidth: number;
  /** 原始高度 */
  naturalHeight: number;
  /** 缩放比例 */
  scale: number;
  /** Rotation in degrees around the image center. */
  rotation?: number;
  /** Optional lower-resolution tracing preview; src remains the archive original. */
  previewSrc?: string;
  /** 不透明度 0-1 */
  opacity: number;
  /** 是否锁定（描图模式时锁定不可拖动） */
  locked: boolean;
  /** 是否可见 */
  visible: boolean;
  /** 所在图层 */
  layerId: string;
  /** 层叠顺序 */
  zIndex: number;
  pageId?: string;
  createdOrder?: number;
  assetId?: string;
  archivePath?: string;
}

// ── 图层系统 ──────────────────────────────────

/** 图层节点（树形） */
export interface LayerNode {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number;
  expanded: boolean;
  parentId: string | null;
  /** 排序序号（同层级内从小到大排列） */
  order: number;
}

// ── 视口状态 ──────────────────────────────────

/** SVG 画布视口（平移 + 缩放） */
export interface ViewportState {
  panX: number;
  panY: number;
  scale: number;
}

// ── 换乘组合 ──────────────────────────────────

/** 换乘组合对象（将多个模块组合为一个换乘站） */
export interface TransferGroup {
  id: string;
  /** 换乘站名称 */
  name: string;
  /** 成员模块 ID 列表 */
  moduleIds: string[];
  /** 涉及线路 ID 列表 */
  lineIds: string[];
  /** 关联站点资源 ID（可选，用于数据联动） */
  sourceStationIds: string[];
  /** 所在图层 */
  layerId: string;
  /** 层叠顺序 */
  zIndex: number;
  /** 是否可见 */
  visible: boolean;
  /** 是否锁定 */
  locked: boolean;
  /** 强调色（可选，用于包围框和标签着色） */
  accentColor?: string;
  pageId?: string;
  createdOrder?: number;
}

/** Source transit data represented independently from the editor's current CSV shape. */
export interface SourceLine {
  id: string;
  kind: string;
  number: string;
  nameZh: string;
  nameEn?: string;
  code?: string;
  lineColor: string;
  stationColor?: string;
  currentColor?: string;
  passedColor?: string;
  textColor?: string;
  description?: string;
}

export interface SourceStationOnLine {
  id: string;
  lineId: string;
  sequence: number;
  nameZh: string;
  nameEn?: string;
  code?: string;
  markerColor?: string;
  terminalType?: string;
  throughLineIds: string[];
  notes?: string;
  isOpen: boolean;
  icon?: string;
}

/** A physical station can unite several source station-on-line records. */
export interface PhysicalStation {
  id: string;
  displayName: string;
  sourceStationIds: string[];
}

export interface SourceMapping {
  id: string;
  sourceLineId?: string;
  sourceStationId?: string;
  sourceStationOnLineId?: string;
  physicalStationId?: string;
  diagramObjectId?: string;
  status?: "mapped" | "unmapped" | "conflict" | "ignored";
  notes?: string;
}

export interface FilterState {
  lineIds: string[];
  servicePatternIds?: string[];
  stationStatuses?: ("open" | "closed" | "terminal")[];
  objectTypes?: string[];
  changeStatuses?: SourceChangeStatus[];
  layerIds?: string[];
  placement?: "all" | "placed" | "unplaced";
  hasDataChanges?: boolean;
  mode?: "target_only" | "retain_transfers" | "dim_others";
  labelLanguageMode?: "zh" | "en" | "bilingual";
}

export type ChangeSeverity = "info" | "warning" | "error";
export type SourceChangeStatus = "unresolved" | "accepted" | "ignored";

export interface SourceChange {
  id: string;
  entityType: "line" | "station" | "transfer" | "service";
  entityId: string;
  changeType: string;
  severity: ChangeSeverity;
  oldValue?: unknown;
  newValue?: unknown;
  affectedObjectIds: string[];
  status: SourceChangeStatus;
  requiresPlacement: boolean;
}

export interface PendingPlacement {
  sourceStationId: string;
  sourceStationOnLineId?: string;
  physicalStationId?: string;
  pageId?: string;
  x?: number;
  y?: number;
}

// ── 运行服务 ──────────────────────────────────

/** 运行模式 */
export type ServiceMode = "normal" | "through" | "route";

/** 运行服务/交路 */
export interface ServicePattern {
  id: string;
  name: string;
  mode: ServiceMode;
  memberLineIds: string[];
  stationPathIds: string[];
  segmentPathIds: string[];
  visible: boolean;
  renderAsIndependentTrack: boolean;
  displayColor?: string;
}

/** 默认交路：L7 与 L9 组成的 79 环线交路。 */
export const DEFAULT_SERVICE_PATTERNS: ServicePattern[] = [
  {
    id: "R1",
    name: "R1 · 79 环线交路",
    mode: "route",
    memberLineIds: ["L7", "L9"],
    stationPathIds: [],
    segmentPathIds: [],
    visible: true,
    renderAsIndependentTrack: false,
    displayColor: "#087FA4",
  },
];

// ── 编辑器常量 ────────────────────────────────

/** 轨道颜色 */
export const TRACK_COLOR = "#202124";
/** 轨道线宽 */
export const TRACK_WIDTH = 3;
/** 站台填充色 */
export const PLATFORM_FILL = "#D7B06A";
/** 站台边框 */
export const PLATFORM_BORDER = "#C49A52";
/** 网格颜色 */
export const GRID_COLOR = "#E0E6EA";
/** 选中框颜色 */
export const SELECTION_COLOR = "#087FA4";
/** 端口颜色 */
export const PORT_COLOR = "#087FA4";
/** 端口吸附半径 */
export const PORT_SNAP_RADIUS = 24;
/** 网格间距 */
export const GRID_SIZE = 20;
/** 轨道间距（上下行正线间距） */
export const TRACK_SPACING = 40;
/** 上行正线 Y */
export const UP_MAIN_Y = 36;
/** 下行正线 Y */
export const DOWN_MAIN_Y = 76;

// ── 默认图层 ──────────────────────────────────

export const DEFAULT_LAYERS: LayerNode[] = [
  // Keep legacy leaf IDs so existing projects continue to resolve object layers.
  { id: "layer-background", name: "背景", visible: true, locked: false, opacity: 1, expanded: true, parentId: null, order: 0 },
  { id: "layer-bg", name: "底图", visible: true, locked: false, opacity: 1, expanded: true, parentId: "layer-background", order: 0 },
  { id: "layer-bg-reference", name: "参考图", visible: true, locked: false, opacity: 1, expanded: true, parentId: "layer-background", order: 1 },

  { id: "layer-track", name: "轨道", visible: true, locked: false, opacity: 1, expanded: true, parentId: null, order: 1 },
  { id: "layer-track-main", name: "正线", visible: true, locked: false, opacity: 1, expanded: true, parentId: "layer-track", order: 0 },
  { id: "layer-track-station", name: "站线", visible: true, locked: false, opacity: 1, expanded: true, parentId: "layer-track", order: 1 },
  { id: "layer-track-turnout", name: "道岔与渡线", visible: true, locked: false, opacity: 1, expanded: true, parentId: "layer-track", order: 2 },
  { id: "layer-track-siding", name: "存车线", visible: true, locked: false, opacity: 1, expanded: true, parentId: "layer-track", order: 3 },
  { id: "layer-track-yard", name: "停车场", visible: true, locked: false, opacity: 1, expanded: true, parentId: "layer-track", order: 4 },
  { id: "layer-track-depot-access", name: "出入段线", visible: true, locked: false, opacity: 1, expanded: true, parentId: "layer-track", order: 5 },
  { id: "layer-track-tram", name: "有轨电车", visible: true, locked: false, opacity: 1, expanded: true, parentId: "layer-track", order: 6 },

  { id: "layer-platform", name: "站台", visible: true, locked: false, opacity: 1, expanded: true, parentId: null, order: 2 },
  { id: "layer-platform-normal", name: "普通站台", visible: true, locked: false, opacity: 1, expanded: true, parentId: "layer-platform", order: 0 },
  { id: "layer-platform-special", name: "特殊站台", visible: true, locked: false, opacity: 1, expanded: true, parentId: "layer-platform", order: 1 },

  { id: "layer-text", name: "文字", visible: true, locked: false, opacity: 1, expanded: true, parentId: null, order: 3 },
  { id: "layer-label", name: "站名", visible: true, locked: false, opacity: 1, expanded: true, parentId: "layer-text", order: 0 },
  { id: "layer-text-yard", name: "场段名称", visible: true, locked: false, opacity: 1, expanded: true, parentId: "layer-text", order: 1 },
  { id: "layer-text-line", name: "线路说明", visible: true, locked: false, opacity: 1, expanded: true, parentId: "layer-text", order: 2 },
  { id: "layer-text-note", name: "备注", visible: true, locked: false, opacity: 1, expanded: true, parentId: "layer-text", order: 3 },
  { id: "layer-text-track-number", name: "股道编号", visible: true, locked: false, opacity: 1, expanded: true, parentId: "layer-text", order: 4 },
  { id: "layer-text-switch-number", name: "道岔编号", visible: true, locked: false, opacity: 1, expanded: true, parentId: "layer-text", order: 5 },

  { id: "layer-icons", name: "图标", visible: true, locked: false, opacity: 1, expanded: true, parentId: null, order: 4 },
  { id: "layer-icon", name: "站点图标", visible: true, locked: false, opacity: 1, expanded: true, parentId: "layer-icons", order: 0 },
  { id: "layer-icon-transfer", name: "换乘图标", visible: true, locked: false, opacity: 1, expanded: true, parentId: "layer-icons", order: 1 },
  { id: "layer-icon-facility", name: "特殊设施图标", visible: true, locked: false, opacity: 1, expanded: true, parentId: "layer-icons", order: 2 },

  { id: "layer-annotation", name: "标注", visible: true, locked: false, opacity: 1, expanded: true, parentId: null, order: 5 },
  { id: "layer-transfer", name: "换乘通道", visible: true, locked: false, opacity: 1, expanded: true, parentId: "layer-annotation", order: 0 },
  { id: "layer-annotation-service", name: "运行关系", visible: true, locked: false, opacity: 1, expanded: true, parentId: "layer-annotation", order: 1 },
  { id: "layer-annotation-custom", name: "自定义标注", visible: true, locked: false, opacity: 1, expanded: true, parentId: "layer-annotation", order: 2 },

  { id: "layer-aux", name: "辅助", visible: true, locked: false, opacity: 1, expanded: true, parentId: null, order: 6 },
  { id: "layer-aux-grid", name: "网格", visible: true, locked: false, opacity: 1, expanded: true, parentId: "layer-aux", order: 0 },
  { id: "layer-aux-snap", name: "吸附线", visible: true, locked: false, opacity: 1, expanded: true, parentId: "layer-aux", order: 1 },
  { id: "layer-aux-control", name: "控制点", visible: true, locked: false, opacity: 1, expanded: true, parentId: "layer-aux", order: 2 },
];

// ── 辅助函数 ──────────────────────────────────

/** 生成唯一 ID */

export function genId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** 吸附到网格 */
export function snapToGrid(value: number, gridSize: number = GRID_SIZE): number {
  return Math.round(value / gridSize) * gridSize;
}

// ── 树形图层辅助函数 ──────────────────────────────

/** 获取某图层的所有祖先 ID（从直接父到根） */
export function getAncestorIds(layers: LayerNode[], layerId: string): string[] {
  const ids: string[] = [];
  let current = layers.find((l) => l.id === layerId);
  while (current?.parentId) {
    ids.push(current.parentId);
    current = layers.find((l) => l.id === current!.parentId);
  }
  return ids;
}

/** 图层是否真正可见（自身可见 + 所有祖先可见） */
export function isLayerTreeVisible(layers: LayerNode[], layerId: string): boolean {
  const layer = layers.find((l) => l.id === layerId);
  if (!layer) return true;
  if (!layer.visible || layer.opacity <= 0) return false;
  return getAncestorIds(layers, layerId).every((pid) => {
    const parent = layers.find((l) => l.id === pid);
    return parent ? parent.visible && parent.opacity > 0 : true;
  });
}

/** 图层是否真正锁定（自身锁定或任一祖先锁定） */
export function isLayerTreeLocked(layers: LayerNode[], layerId: string): boolean {
  const layer = layers.find((l) => l.id === layerId);
  if (!layer) return false;
  if (layer.locked) return true;
  return getAncestorIds(layers, layerId).some((pid) => {
    const parent = layers.find((l) => l.id === pid);
    return parent ? parent.locked : false;
  });
}

/** 获取某父节点的直接子图层（按 order 排序） */
export function getChildLayers(layers: LayerNode[], parentId: string): LayerNode[] {
  return layers
    .filter((l) => l.parentId === parentId)
    .sort((a, b) => a.order - b.order);
}

/** 获取根图层（parentId 为 null，按 order 排序） */
export function getRootLayers(layers: LayerNode[]): LayerNode[] {
  return layers
    .filter((l) => l.parentId === null)
    .sort((a, b) => a.order - b.order);
}

/** 判断图层是否有子图层 */
export function hasChildren(layers: LayerNode[], layerId: string): boolean {
  return layers.some((l) => l.parentId === layerId);
}

/** 将扁平图层数组按树序展开为渲染顺序（深度优先，父在前） */
export function flattenLayerTree(layers: LayerNode[]): LayerNode[] {
  const result: LayerNode[] = [];
  function walk(parentId: string | null) {
    const children = layers
      .filter((l) => l.parentId === parentId)
      .sort((a, b) => a.order - b.order);
    for (const child of children) {
      result.push(child);
      walk(child.id);
    }
  }
  walk(null);
  return result;
}

/** Every exposed rail endpoint may connect to another exposed rail endpoint. */
export function portsCompatible(_roleA: PortRole, _roleB: PortRole): boolean {
  return true;
}

/** 将模块局部坐标旋转到世界坐标 */
export function rotatePoint(
  x: number,
  y: number,
  cx: number,
  cy: number,
  rotation: number,
): { x: number; y: number } {
  const rad = (rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = x - cx;
  const dy = y - cy;
  return {
    x: cx + dx * cos - dy * sin,
    y: cy + dx * sin + dy * cos,
  };
}

/** 获取模块端口在世界坐标中的位置 */
export function worldPortPosition(
  module: DiagramModule,
  template: ModuleTemplate,
  portId: string,
): { x: number; y: number; direction: number } {
  const port = template.ports.find((p) => p.id === portId);
  if (!port) return { x: module.x, y: module.y, direction: 0 };
  const cx = template.width / 2;
  const cy = template.height / 2;
  // 镜像在模块局部坐标中先作用（左右/上下翻转），再旋转到世界坐标。
  let lx = port.x;
  let ly = port.y;
  let dir = port.direction;
  if (module.mirrorX) {
    lx = template.width - lx;
    // 水平翻转（x→−x）：角度 θ → 180°−θ
    dir = (180 - dir + 360) % 360;
  }
  if (module.mirrorY) {
    ly = template.height - ly;
    // 垂直翻转（y→−y）：角度 θ → −θ
    dir = (360 - dir) % 360;
  }
  const rotated = rotatePoint(lx, ly, cx, cy, module.rotation);
  return {
    // DiagramModule.x/y are the template's top-left position.  The SVG module
    // group rotates around the template centre, so the rotated local point is
    // still relative to that top-left origin.
    x: module.x + rotated.x,
    y: module.y + rotated.y,
    direction: (dir + module.rotation) % 360,
  };
}

/**
 * 根据控制点路径重建连接轨道段。
 *
 * 语义化轨道模型的核心：当连接存在控制点时，连接轨道不再是单一直线，
 * 而是由 [from, ...controlPoints, to] 串联的折线/曲线。
 *
 * - 直线段（curved=false）：使用 line 端点。
 * - 曲线段（curved=true）：附带 cx/cy（控制柄绝对坐标），渲染时用 SVG Q 命令。
 *
 * 返回的 TemplateTrack[] 同时被交叉点计算复用（使用直线投影）。
 */
export function rebuildTracksFromControlPoints(
  from: { x: number; y: number },
  to: { x: number; y: number },
  controlPoints: TrackControlPoint[],
): TemplateTrack[] {
  const pts = [from, ...controlPoints, to];
  const tracks: TemplateTrack[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const track: TemplateTrack = { x1: a.x, y1: a.y, x2: b.x, y2: b.y, type: "main" };
    // 该段由第 i 个控制点起始（controlPoints[i] 对应 pts[i+0]，即段 i 的起点），
    // 若该控制点启用曲率，记录弧线信息供渲染使用。
    if (i < controlPoints.length && controlPoints[i].curved) {
      const cp = controlPoints[i];
      track.curved = true;
      track.cx = cp.x + cp.handleX;
      track.cy = cp.y + cp.handleY;
    }
    tracks.push(track);
  }
  return tracks;
}

/**
 * 生成 SVG path 字符串：从 from 经控制点到 to，使用三次贝塞尔（C 命令）实现平滑曲线。
 *
 * 路径结构：
 *   from ─(L)─► implicit1 ─(C)─► …midCPs… ─(C)─► implicit2 ─(L)─► to
 *
 * - 端口→隐式锚点：直线段（L），确保轨道沿端口方向笔直引出
 * - 锚点→锚点/中间 CP：三次贝塞尔（C），对称手柄保证 C1 平滑
 * - 隐式锚点手柄 = 端口方向 × 投影幅值（指向中间，平行于线路）
 * - 中间 CP 手柄 = 对称手柄，幅度为总距离的 15%（上限 50px）
 * - 非隐式、非曲线 CP（用户添加的折线节点）：直线连接（L）
 */
export function buildControlPointPathD(
  from: { x: number; y: number },
  to: { x: number; y: number },
  controlPoints: TrackControlPoint[],
  fromDir: number,
  toDir: number,
): string {
  if (controlPoints.length === 0) {
    return `M${from.x.toFixed(2)},${from.y.toFixed(2)} L${to.x.toFixed(2)},${to.y.toFixed(2)}`;
  }

  if (controlPoints.some((point) => point.directionOnly)) {
    return buildDirectionOnlyControlPointPathD(from, to, controlPoints, fromDir, toDir);
  }

  const dist = Math.hypot(to.x - from.x, to.y - from.y);
  const fromRad = (fromDir * Math.PI) / 180;
  const toRad = (toDir * Math.PI) / 180;
  const endHandleMag = Math.min(dist * 0.15, 30);

  let d = `M${from.x.toFixed(2)},${from.y.toFixed(2)}`;

  // 遍历所有 controlPoints，不跳过隐式锚点
  for (let i = 0; i < controlPoints.length; i++) {
    const cp = controlPoints[i];
    const isFirst = i === 0;
    const isLast = i === controlPoints.length - 1;
    const prev = i > 0 ? controlPoints[i - 1] : null;

    // 决定前一段的起始点（用于计算手柄）
    const segStart = prev || from;

    if (cp.implicit && isFirst) {
      // from → implicit1：直线，沿端口方向引出
      d += ` L${cp.x.toFixed(2)},${cp.y.toFixed(2)}`;
    } else if (cp.implicit && isLast) {
      // prev → implicit2 → to：
      //   prev→implicit2 用 C（若 prev 为曲线），implicit2→to 为直线
      if (prev && prev.curved && (prev.handleX !== 0 || prev.handleY !== 0)) {
        const outHx = prev.handleX;
        const outHy = prev.handleY;
        const inHx = cp.handleX;
        const inHy = cp.handleY;
        d += ` C${(prev.x + outHx).toFixed(2)},${(prev.y + outHy).toFixed(2)} ${(cp.x - inHx).toFixed(2)},${(cp.y - inHy).toFixed(2)} ${cp.x.toFixed(2)},${cp.y.toFixed(2)}`;
      } else {
        d += ` L${cp.x.toFixed(2)},${cp.y.toFixed(2)}`;
      }
      // implicit2 → to：直线
      d += ` L${to.x.toFixed(2)},${to.y.toFixed(2)}`;
    } else if (cp.curved && (cp.handleX !== 0 || cp.handleY !== 0)) {
      // 曲线段：使用三次贝塞尔，对称手柄
      // 出向控制点 = prev + prev.handle（或 from + fromExit）
      // 入向控制点 = cp - cp.handle
      const outHx = prev && prev.curved ? prev.handleX : isFirst ? Math.cos(fromRad) * endHandleMag : 0;
      const outHy = prev && prev.curved ? prev.handleY : isFirst ? Math.sin(fromRad) * endHandleMag : 0;
      d += ` C${(segStart.x + outHx).toFixed(2)},${(segStart.y + outHy).toFixed(2)} ${(cp.x - cp.handleX).toFixed(2)},${(cp.y - cp.handleY).toFixed(2)} ${cp.x.toFixed(2)},${cp.y.toFixed(2)}`;
    } else {
      // 直线段
      d += ` L${cp.x.toFixed(2)},${cp.y.toFixed(2)}`;
    }
  }

  // 如果最后一个 CP 不是隐式锚点，追加到 to 的直线
  const lastCP = controlPoints[controlPoints.length - 1];
  if (!lastCP.implicit) {
    if (lastCP.curved && (lastCP.handleX !== 0 || lastCP.handleY !== 0)) {
      d += ` C${(lastCP.x + lastCP.handleX).toFixed(2)},${(lastCP.y + lastCP.handleY).toFixed(2)} ${(to.x - Math.cos(toRad) * endHandleMag).toFixed(2)},${(to.y - Math.sin(toRad) * endHandleMag).toFixed(2)} ${to.x.toFixed(2)},${to.y.toFixed(2)}`;
    } else {
      d += ` L${to.x.toFixed(2)},${to.y.toFixed(2)}`;
    }
  }

  return d;
}

type PathPoint = { x: number; y: number };

function directionUnit(direction: number): PathPoint {
  const radians = (direction * Math.PI) / 180;
  return { x: Math.cos(radians), y: Math.sin(radians) };
}

function pointDirection(point: TrackControlPoint): PathPoint | null {
  if (point.directionOnly && typeof point.tangentDirection === "number") {
    return directionUnit(point.tangentDirection);
  }
  if (!point.curved) return null;
  const length = Math.hypot(point.handleX, point.handleY);
  return length > 1e-6 ? { x: point.handleX / length, y: point.handleY / length } : null;
}

function derivedHandleLength(
  start: PathPoint,
  end: PathPoint,
  tangent: PathPoint,
): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length < 1e-6) return 0;
  const chord = { x: dx / length, y: dy / length };
  // The handle depends only on this local segment. There is intentionally no
  // fixed minimum: near a station it shrinks with the available distance.
  const alignment = Math.max(0, tangent.x * chord.x + tangent.y * chord.y);
  return length * (0.14 + alignment * 0.14);
}

/**
 * The control point of a quadratic quarter turn is the intersection of the
 * two endpoint tangent guides. The editable node itself is stored separately
 * on the curve, so it can be selected and dragged without appearing off-track.
 */
function quadraticTangentIntersection(
  from: PathPoint,
  to: PathPoint,
  fromDir: number,
  toDir: number,
): PathPoint | null {
  const fromTangent = directionUnit(fromDir);
  const toOutward = directionUnit(toDir);
  const determinant = fromTangent.x * toOutward.y - fromTangent.y * toOutward.x;
  if (Math.abs(determinant) < 1e-8) return null;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distanceAlongFrom = (dx * toOutward.y - dy * toOutward.x) / determinant;
  return {
    x: from.x + fromTangent.x * distanceAlongFrom,
    y: from.y + fromTangent.y * distanceAlongFrom,
  };
}

/**
 * Renders direction-constrained knots. Endpoints and these knots carry only
 * a tangent direction; the actual Bezier control lengths are derived locally
 * and never stored in the project.
 */
export function buildDirectionOnlyControlPointPathD(
  from: PathPoint,
  to: PathPoint,
  controlPoints: TrackControlPoint[],
  fromDir: number,
  toDir: number,
): string {
  const quadraticPoint = controlPoints.length === 1 && controlPoints[0].curveKind === "quadratic"
    ? controlPoints[0]
    : undefined;
  if (quadraticPoint) {
    const tangentIntersection = quadraticTangentIntersection(from, to, fromDir, toDir) || quadraticPoint;
    return `M${from.x.toFixed(2)},${from.y.toFixed(2)} Q${tangentIntersection.x.toFixed(2)},${tangentIntersection.y.toFixed(2)} ${to.x.toFixed(2)},${to.y.toFixed(2)}`;
  }

  const points: PathPoint[] = [from, ...controlPoints, to];
  const tangents: Array<PathPoint | null> = [
    directionUnit(fromDir),
    ...controlPoints.map(pointDirection),
    directionUnit((toDir + 180) % 360),
  ];
  let d = `M${from.x.toFixed(2)},${from.y.toFixed(2)}`;

  for (let index = 0; index < points.length - 1; index++) {
    const start = points[index];
    const end = points[index + 1];
    const startTangent = tangents[index];
    const endTangent = tangents[index + 1];
    if (!startTangent || !endTangent) {
      d += ` L${end.x.toFixed(2)},${end.y.toFixed(2)}`;
      continue;
    }

    const startLength = derivedHandleLength(start, end, startTangent);
    const incomingDirection = { x: -endTangent.x, y: -endTangent.y };
    const endLength = derivedHandleLength(end, start, incomingDirection);
    d += ` C${(start.x + startTangent.x * startLength).toFixed(2)},${(start.y + startTangent.y * startLength).toFixed(2)} ${(end.x - endTangent.x * endLength).toFixed(2)},${(end.y - endTangent.y * endLength).toFixed(2)} ${end.x.toFixed(2)},${end.y.toFixed(2)}`;
  }

  return d;
}
