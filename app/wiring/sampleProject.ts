import { siteUrl } from "../site";
import { DEFAULT_PROJECT_ID } from "../projects/types";
import { migrateProjectSchema, type ProjectFile } from "./projectStore";

const DEFAULT_WIRING_SAMPLE_PATH = "sample-projects/default/wiring.json";
export const DEFAULT_WIRING_SAMPLE_MARKER = "wiring:default:sample:void-city-v2";
const PREVIOUS_BUNDLED_SAMPLE_UPDATED_AT = "2026-08-13T07:53:36.646Z";

/**
 * A saved empty shell should not prevent the built-in Void City example from
 * appearing, while any real user work must always win over the sample.
 */
export function isWiringProjectEmpty(project: ProjectFile | null): boolean {
  if (!project) return true;
  return !project.modules.length
    && !project.connections.length
    && !project.labels.length
    && !project.transferGroups.length
    && !project.platforms.length
    && !project.graphics.length
    && !project.backgroundImages.length;
}

/** Upgrade the untouched v1 bundled example, but never replace user-edited work. */
export function shouldInstallDefaultWiringSample(project: ProjectFile | null): boolean {
  if (isWiringProjectEmpty(project)) return true;
  return project?.projectInfo?.name === "虚空城示例配线图"
    && project.projectInfo.updatedAt === PREVIOUS_BUNDLED_SAMPLE_UPDATED_AT
    && project.modules.length === 142
    && project.connections.length === 266;
}

/**
 * Only the fixed default project receives the bundled example. Projects made
 * with the portal have generated IDs and therefore continue to start blank.
 */
export async function loadDefaultWiringSample(
  projectId: string,
  fetcher: typeof fetch = fetch,
): Promise<ProjectFile | null> {
  if (projectId !== DEFAULT_PROJECT_ID) return null;
  const response = await fetcher(siteUrl(DEFAULT_WIRING_SAMPLE_PATH), { cache: "no-store" });
  if (!response.ok) throw new Error(`无法读取虚空城示例配线图（HTTP ${response.status}）`);
  return migrateProjectSchema(await response.json() as ProjectFile);
}
