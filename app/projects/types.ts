import type { RevisionInfo, TransitData } from "../transit/types";

/** The persistence target selected by the portal/runtime. */
export type StorageMode = "http" | "browser" | "static";

export interface ProjectSummary {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  storageMode: StorageMode;
}

export interface ProjectCapabilities {
  canCreateProjects: boolean;
  canDeleteProjects: boolean;
  canSaveTransitData: boolean;
  canSaveLayout: boolean;
  canManageAssets: boolean;
  canRestoreRevisions: boolean;
}

export interface ProjectAsset {
  name: string;
  blob: Blob;
  updatedAt: string;
}

export interface ProjectRepository {
  readonly mode: StorageMode;
  readonly capabilities: ProjectCapabilities;
  listProjects(): Promise<ProjectSummary[]>;
  createProject(name: string): Promise<ProjectSummary>;
  deleteProject(projectId: string): Promise<void>;
  loadTransitData(projectId: string): Promise<TransitData>;
  /** Saves source data and creates a user-visible revision when supported. */
  saveTransitData(projectId: string, data: TransitData): Promise<{ revision?: RevisionInfo }>;
  /** Persists style/layout settings without changing source-data revision semantics. */
  saveLayout(projectId: string, data: TransitData): Promise<TransitData>;
  listRevisions(projectId: string): Promise<RevisionInfo[]>;
  restoreRevision(projectId: string, revisionId: string): Promise<TransitData>;
  listAssets(projectId: string): Promise<string[]>;
  /** Lists only assets uploaded by the user; built-in/public resources are excluded. */
  listCustomAssets(projectId: string): Promise<string[]>;
  getAsset(projectId: string, name: string): Promise<ProjectAsset | null>;
  putAsset(projectId: string, name: string, blob: Blob): Promise<void>;
  deleteAsset(projectId: string, name: string): Promise<void>;
}

export const DEFAULT_PROJECT_ID = "default";
