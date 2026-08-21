import type { ModuleTemplate } from "./types";

export type DefaultOverrideMode = "template" | "uniform";
export type DefaultOverrideKey = "spacing" | "platformLength" | "platformWidth" | "length" | "branchOffset" | "shapeRadius";

export const DEFAULT_OVERRIDE_MODES: Record<DefaultOverrideKey, DefaultOverrideMode> = {
  spacing: "template",
  platformLength: "template",
  platformWidth: "template",
  length: "template",
  branchOffset: "template",
  shapeRadius: "template",
};

export function resolveDefaultOverrideMode(
  modes: Partial<Record<DefaultOverrideKey, DefaultOverrideMode>>,
  key: DefaultOverrideKey,
): DefaultOverrideMode {
  return modes[key] === "uniform" ? "uniform" : "template";
}

export interface PlacementDefaultValues {
  spacing: number;
  platformLength: number;
  platformWidth: number;
  length: number;
  branchOffset: number;
  alignBranchEnds: boolean;
}

/**
 * 为新模块生成模板参数。
 *
 * 默认先完整保留模板参数，只有用户明确选择「统一设置」的键才覆盖。
 * 统一值会按当前模板自己的 min/max 钳制，因此不会把普通单开道岔的
 * 开口幅度写入双线分岔不支持的范围，反之亦然。
 */
export function buildPlacementCustomParams(
  template: Pick<ModuleTemplate, "params">,
  modes: Partial<Record<DefaultOverrideKey, DefaultOverrideMode>>,
  values: PlacementDefaultValues,
): Record<string, number> | undefined {
  if (!template.params?.length) return undefined;
  const result = Object.fromEntries(template.params.map((parameter) => [parameter.key, parameter.default]));
  const overrides: Record<string, number | undefined> = {
    spacing: resolveDefaultOverrideMode(modes, "spacing") === "uniform" ? values.spacing : undefined,
    platformLength: resolveDefaultOverrideMode(modes, "platformLength") === "uniform" ? values.platformLength : undefined,
    platformWidth: resolveDefaultOverrideMode(modes, "platformWidth") === "uniform" ? values.platformWidth : undefined,
    length: resolveDefaultOverrideMode(modes, "length") === "uniform" ? values.length : undefined,
    branchOffset: resolveDefaultOverrideMode(modes, "branchOffset") === "uniform" ? values.branchOffset : undefined,
    alignBranchEnds: values.alignBranchEnds ? 1 : undefined,
  };
  for (const parameter of template.params) {
    const override = overrides[parameter.key];
    if (override == null || !Number.isFinite(override)) continue;
    result[parameter.key] = Math.min(parameter.max, Math.max(parameter.min, override));
  }
  return result;
}
