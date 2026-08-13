import { siteUrl } from "../site";
import { DEFAULT_PROJECT_ID } from "../projects/types";
import { migrateProjectSchema, type ProjectFile } from "./projectStore";

const DEFAULT_WIRING_SAMPLE_PATH = "sample-projects/default/wiring.json";
export const DEFAULT_WIRING_SAMPLE_MARKER = "wiring:default:sample:void-city-v1";

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
