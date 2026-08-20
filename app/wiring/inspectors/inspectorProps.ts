"use client";

import type { ChangeEvent, Dispatch, RefObject, SetStateAction } from "react";
import { useHistory } from "../history";
import {
  type AttachedGraphic,
  type BackgroundImageObject,
  type DiagramModule,
  type LabelObject,
  type LayerNode,
  type ModuleConnection,
  type ModuleTemplate,
  type PlatformObject,
  type TransferGroup,
} from "../types";
import type { TransitData } from "../../transit/types";
import type { CanvasRenderItem } from "../ui/primitives";
import type { DiagramPage } from "../projectStore";

/** 组件内 `getConnectionEndpoints` 的返回类型（与 ../connectionEdit 的纯函数一致） */
type ConnectionEndpoints = { from: { x: number; y: number }; to: { x: number; y: number }; fromDir: number; toDir: number } | null;

/**
 * 右侧属性面板各 inspector 共用的组件作用域上下文。
 * 由 WiringDiagramApp 每次渲染时构造一个普通对象字面量传入。
 */
export interface InspectorContext {
  // ── 数据与状态 ──
  data: TransitData;
  modules: DiagramModule[];
  connections: ModuleConnection[];
  layers: LayerNode[];
  platforms: PlatformObject[];
  labels: LabelObject[];
  graphics: AttachedGraphic[];
  selectedIds: string[];
  history: ReturnType<typeof useHistory>;

  // ── 选中对象 ──
  selectedConnection: ModuleConnection | null;
  selectedBgImage: BackgroundImageObject | null;
  selectedMod: DiagramModule | null;
  selectedTemplate: ModuleTemplate | null | undefined;
  selectedPlatform: PlatformObject | null;
  selectedGraphic: AttachedGraphic | null;
  selectedLabel: LabelObject | null;
  selectedTransferGroup: TransferGroup | null;

  // ── 派生值 ──
  bgLocked: boolean;
  selectableLayers: string[];
  activePage: DiagramPage;
  templateMap: Map<string, ModuleTemplate>;
  advancedMode: boolean;
  manualCurveEditingId: string | null;
  editingPlatformModuleId: string | null;
  overlappingLabelItems: CanvasRenderItem[];
  automaticPlacementLayerName: string | undefined;

  // ── 放置默认值 ──
  placementRotation: number;
  placementMirrorX: boolean;
  placementMirrorY: boolean;
  placementZIndex: number;
  placementLayerId: string;

  // ── 引用 ──
  replaceBackgroundInputRef: RefObject<HTMLInputElement | null>;

  // ── setter ──
  setConnections: Dispatch<SetStateAction<ModuleConnection[]>>;
  setHasUnsavedChanges: Dispatch<SetStateAction<boolean>>;
  setStatus: Dispatch<SetStateAction<string>>;
  setSelectedIds: Dispatch<SetStateAction<string[]>>;
  setManualCurveEditingId: Dispatch<SetStateAction<string | null>>;
  setModules: Dispatch<SetStateAction<DiagramModule[]>>;
  setPlatforms: Dispatch<SetStateAction<PlatformObject[]>>;
  setLabels: Dispatch<SetStateAction<LabelObject[]>>;
  setEditingPlatformModuleId: Dispatch<SetStateAction<string | null>>;
  setPlacementRotation: Dispatch<SetStateAction<number>>;
  setPlacementMirrorX: Dispatch<SetStateAction<boolean>>;
  setPlacementMirrorY: Dispatch<SetStateAction<boolean>>;
  setPlacementZIndex: Dispatch<SetStateAction<number>>;
  setPlacementLayerId: Dispatch<SetStateAction<string>>;

  // ── 组件内辅助回调 ──
  isLayerLocked: (layerId: string) => boolean;
  getConnectionEndpoints: (conn: ModuleConnection) => ConnectionEndpoints;
  updateConnectionAndPairedRail: (previous: ModuleConnection[], connectionId: string, update: (connection: ModuleConnection) => ModuleConnection) => ModuleConnection[];
  updateConnection: (id: string, patch: Partial<ModuleConnection>, operationName?: string) => void;
  setConnectionLineStyle: (id: string, lineStyle: "solid" | "dashed") => void;
  cycleCrossingType: (connId: string) => void;
  removeCrossingPoint: (connId: string, index: number) => void;
  addControlPointMidpoint: (connId: string) => void;
  removeControlPoint: (connId: string, cpId: string) => void;
  straightenConnection: (connId: string) => void;
  regenerateAutoControlPoints: (connId: string) => void;
  updateBgImage: (id: string, patch: Partial<BackgroundImageObject>, operationName?: string) => void;
  handleReplaceBackgroundInput: (e: ChangeEvent<HTMLInputElement>) => void;
  deleteBgImage: (id: string) => void;
  updateModule: (id: string, patch: Partial<DiagramModule>, operationName?: string) => void;
  /** 批量设置多个模块的公共模板参数（仅对 base 模板声明了该 key 的模块生效） */
  applyBatchParamUpdate: (ids: string[], key: string, value: number) => void;
  deleteSelected: () => void;
  updatePlatform: (id: string, patch: Partial<PlatformObject>, operationName?: string) => void;
  deletePlatform: (id: string) => void;
  updateGraphic: (id: string, patch: Partial<AttachedGraphic>, operationName?: string) => void;
  updateLabel: (id: string, patch: Partial<LabelObject>, operationName?: string) => void;
  deleteLabel: (id: string) => void;
  renderItemName: (entry: CanvasRenderItem) => string;
  moveLabelRelative: (label: LabelObject, entry: CanvasRenderItem, above: boolean) => void;
  moveLabelToEdge: (label: LabelObject, top: boolean) => void;
  updateTransferGroup: (id: string, patch: Partial<TransferGroup>, operationName?: string) => void;
  removeModuleFromGroup: (groupId: string, moduleId: string) => void;
  addSelectedModulesToGroup: (groupId: string) => void;
  deleteTransferGroup: (id: string) => void;
}

export type InspectorProps = { ctx: InspectorContext };
