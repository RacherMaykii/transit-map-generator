import { useCallback, useRef, useState, type RefObject } from "react";
import type { TransitData } from "../transit/types";
import type {
  AssetRecord,
  AttachedGraphic,
  BackgroundImageObject,
  DiagramModule,
  FilterState,
  LabelObject,
  LayerNode,
  ModuleConnection,
  PendingPlacement,
  PhysicalStation,
  PlatformObject,
  ServicePattern,
  SourceChange,
  SourceLine,
  SourceMapping,
  SourceStationOnLine,
  TransferGroup,
} from "./types";
import type { CanvasPageSettings } from "./canvasLogic";

/** Complete editable state captured by undo/redo. */
export interface HistorySnapshot {
  modules: DiagramModule[];
  connections: ModuleConnection[];
  layers: LayerNode[];
  backgroundImages: BackgroundImageObject[];
  labels: LabelObject[];
  transferGroups: TransferGroup[];
  transitData: TransitData | null;
  pages: CanvasPageSettings[];
  servicePatterns: ServicePattern[];
  platforms: PlatformObject[];
  graphics: AttachedGraphic[];
  assets: AssetRecord[];
  sourceLines: SourceLine[];
  sourceStationsOnLine: SourceStationOnLine[];
  physicalStations: PhysicalStation[];
  sourceMappings: SourceMapping[];
  filters: FilterState;
  unresolvedChanges: SourceChange[];
  pendingPlacement: PendingPlacement | null;
  operationName: string;
}

/** Refs for the extended history API. All v2 additions are optional for incremental UI wiring. */
export interface HistoryStateRefs {
  modules: RefObject<DiagramModule[]>;
  connections: RefObject<ModuleConnection[]>;
  layers: RefObject<LayerNode[]>;
  backgroundImages: RefObject<BackgroundImageObject[]>;
  labels: RefObject<LabelObject[]>;
  transferGroups: RefObject<TransferGroup[]>;
  transitData?: RefObject<TransitData | null>;
  pages?: RefObject<CanvasPageSettings[]>;
  servicePatterns?: RefObject<ServicePattern[]>;
  platforms?: RefObject<PlatformObject[]>;
  graphics?: RefObject<AttachedGraphic[]>;
  assets?: RefObject<AssetRecord[]>;
  sourceLines?: RefObject<SourceLine[]>;
  sourceStationsOnLine?: RefObject<SourceStationOnLine[]>;
  physicalStations?: RefObject<PhysicalStation[]>;
  sourceMappings?: RefObject<SourceMapping[]>;
  filters?: RefObject<FilterState>;
  unresolvedChanges?: RefObject<SourceChange[]>;
  pendingPlacement?: RefObject<PendingPlacement | null>;
}

interface HistoryStack { past: HistorySnapshot[]; future: HistorySnapshot[]; }
const MAX_HISTORY = 100;

/** A data-only clone keeps snapshots immune to subsequent CSV/object mutations. */
export function cloneHistorySnapshot(snapshot: HistorySnapshot): HistorySnapshot {
  return JSON.parse(JSON.stringify(snapshot)) as HistorySnapshot;
}

function readSnapshot(refs: HistoryStateRefs, operationName: string): HistorySnapshot {
  return cloneHistorySnapshot({
    modules: refs.modules.current || [], connections: refs.connections.current || [], layers: refs.layers.current || [],
    backgroundImages: refs.backgroundImages.current || [], labels: refs.labels.current || [], transferGroups: refs.transferGroups.current || [],
    transitData: refs.transitData?.current || null, pages: refs.pages?.current || [], servicePatterns: refs.servicePatterns?.current || [],
    platforms: refs.platforms?.current || [], graphics: refs.graphics?.current || [], assets: refs.assets?.current || [],
    sourceLines: refs.sourceLines?.current || [], sourceStationsOnLine: refs.sourceStationsOnLine?.current || [],
    physicalStations: refs.physicalStations?.current || [], sourceMappings: refs.sourceMappings?.current || [],
    filters: refs.filters?.current || { lineIds: [] }, unresolvedChanges: refs.unresolvedChanges?.current || [],
    pendingPlacement: refs.pendingPlacement?.current || null, operationName,
  });
}

/**
 * Undo/redo supports both the legacy six-ref invocation and a v2 state-ref object.
 * New consumers should pass the object so transit and source state participate in undo.
 */
export function useHistory(refs: HistoryStateRefs): ReturnType<typeof useHistoryFromRefs>;
export function useHistory(
  modules: RefObject<DiagramModule[]>, connections: RefObject<ModuleConnection[]>, layers: RefObject<LayerNode[]>,
  backgroundImages: RefObject<BackgroundImageObject[]>, labels: RefObject<LabelObject[]>, transferGroups: RefObject<TransferGroup[]>,
): ReturnType<typeof useHistoryFromRefs>;
export function useHistory(
  refsOrModules: HistoryStateRefs | RefObject<DiagramModule[]>, connections?: RefObject<ModuleConnection[]>, layers?: RefObject<LayerNode[]>,
  backgroundImages?: RefObject<BackgroundImageObject[]>, labels?: RefObject<LabelObject[]>, transferGroups?: RefObject<TransferGroup[]>,
) {
  const refs: HistoryStateRefs = connections && layers && backgroundImages && labels && transferGroups
    ? { modules: refsOrModules as RefObject<DiagramModule[]>, connections, layers, backgroundImages, labels, transferGroups }
    : refsOrModules as HistoryStateRefs;
  return useHistoryFromRefs(refs);
}

function useHistoryFromRefs(refs: HistoryStateRefs) {
  const stackRef = useRef<HistoryStack>({ past: [], future: [] });
  const [, setTick] = useState(0);
  const forceUpdate = useCallback(() => setTick((n) => n + 1), []);
  const captureSnapshot = useCallback((operationName: string) => {
    const stack = stackRef.current;
    stack.past = [...stack.past, readSnapshot(refs, operationName)].slice(-MAX_HISTORY);
    stack.future = [];
    forceUpdate();
  }, [refs, forceUpdate]);
  const undo = useCallback((): HistorySnapshot | null => {
    const stack = stackRef.current;
    if (!stack.past.length) return null;
    const previous = stack.past.at(-1)!;
    stack.past = stack.past.slice(0, -1);
    stack.future = [readSnapshot(refs, previous.operationName), ...stack.future].slice(0, MAX_HISTORY);
    forceUpdate();
    return cloneHistorySnapshot(previous);
  }, [refs, forceUpdate]);
  const redo = useCallback((): HistorySnapshot | null => {
    const stack = stackRef.current;
    if (!stack.future.length) return null;
    const next = stack.future[0];
    stack.past = [...stack.past, readSnapshot(refs, next.operationName)].slice(-MAX_HISTORY);
    stack.future = stack.future.slice(1);
    forceUpdate();
    return cloneHistorySnapshot(next);
  }, [refs, forceUpdate]);
  const discardSnapshot = useCallback(() => {
    const stack = stackRef.current;
    if (stack.past.length > 0) {
      stack.past = stack.past.slice(0, -1);
      forceUpdate();
    }
  }, [forceUpdate]);
  const clearHistory = useCallback(() => { stackRef.current = { past: [], future: [] }; forceUpdate(); }, [forceUpdate]);
  // 预览下一次撤销/重做的快照但不弹出，用于"撤销涉及画布尺寸变更"时先确认。
  const peekUndo = useCallback((): HistorySnapshot | null => {
    const stack = stackRef.current;
    if (!stack.past.length) return null;
    return cloneHistorySnapshot(stack.past.at(-1)!);
  }, []);
  const peekRedo = useCallback((): HistorySnapshot | null => {
    const stack = stackRef.current;
    if (!stack.future.length) return null;
    return cloneHistorySnapshot(stack.future[0]);
  }, []);
  const stack = stackRef.current;
  return { captureSnapshot, discardSnapshot, undo, redo, clearHistory, peekUndo, peekRedo, canUndo: stack.past.length > 0, canRedo: stack.future.length > 0,
    pastCount: stack.past.length, futureCount: stack.future.length, lastOperation: stack.past.at(-1)?.operationName || null,
    nextOperation: stack.future[0]?.operationName || null };
}
