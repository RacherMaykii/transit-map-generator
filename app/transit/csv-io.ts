// ──────────────────────────────────────────────
// 配线图编辑器 · CSV 导入解析与校验
// ──────────────────────────────────────────────

import type { Station, TerminalType, Transfer, TransitData, TransitLine } from "./types";
import Papa from "papaparse";
import { z } from "zod";

// ── CSV 列头定义 ──────────────────────────────

export const LINES_COLUMNS = [
  "id", "kind", "number", "name_zh", "name_en", "code",
  "line_color", "station_color", "current_color", "passed_color", "text_color", "description",
] as const;

export const STATIONS_COLUMNS = [
  "id", "line_id", "sequence", "name_zh", "name_en", "code",
  "marker_color", "terminal_type", "through_line_ids", "notes", "is_open", "icon",
] as const;

export const TRANSFERS_COLUMNS = [
  "id", "station_id", "target_line_id", "order", "color_override", "hidden",
] as const;

export type CsvFileType = "lines" | "stations" | "transfers";

export const CSV_FILE_PATTERNS: { type: CsvFileType; label: string; headers: readonly string[] }[] = [
  { type: "lines", label: "线路表", headers: LINES_COLUMNS },
  { type: "stations", label: "站点表", headers: STATIONS_COLUMNS },
  { type: "transfers", label: "换乘表", headers: TRANSFERS_COLUMNS },
];

// ── CSV 解析器 ──────────────────────────────

export type CsvRow = Record<string, string | undefined>;

interface CsvParseDetail {
  rows: CsvRow[];
  issues: CsvImportIssue[];
}

/** PapaParse-backed parser with BOM handling and source-located diagnostics. */
export function parseCsvDetailed(input: string, fileName = "CSV"): CsvParseDetail {
  const result = Papa.parse<CsvRow>(input.replace(/^\uFEFF+/, ""), {
    header: true,
    skipEmptyLines: "greedy",
    transform: (value) => value === "" ? undefined : value,
  });
  const issues = result.errors.map((error) => ({
    severity: "错误" as const,
    category: "CSV 解析",
    message: error.message,
    fileName,
    rowNumber: typeof error.row === "number" ? error.row + 2 : undefined,
  }));
  return { rows: result.data, issues };
}

export function parseCsv(input: string): CsvRow[] {
  return parseCsvDetailed(input).rows;
}

/** 根据文件名推断 CSV 类型 */
export function detectCsvType(filename: string): CsvFileType | null {
  const lower = filename.toLowerCase();
  if (lower.includes("line")) return "lines";
  if (lower.includes("station")) return "stations";
  if (lower.includes("transfer")) return "transfers";
  return null;
}

// ── 行转换器（与 local-data-server.mjs 一致） ──────────────

export function linesFromCsv(rows: CsvRow[]): TransitLine[] {
  return rows.map((row) => ({
    id: row.id || "",
    kind: row.kind === "tram" ? "tram" : "metro",
    number: row.number || "",
    nameZh: row.name_zh || "",
    nameEn: row.name_en || "",
    code: row.code || "",
    lineColor: row.line_color || "",
    stationColor: row.station_color || "",
    currentColor: row.current_color || "",
    passedColor: row.passed_color || "",
    textColor: row.text_color || "",
    description: row.description || "",
  }));
}

export function stationsFromCsv(rows: CsvRow[]): Station[] {
  return rows.map((row) => ({
    id: row.id || "",
    lineId: row.line_id || "",
    sequence: Number(row.sequence) || 0,
    nameZh: row.name_zh || "",
    nameEn: row.name_en || "",
    code: row.code || "",
    markerColor: row.marker_color || "",
    terminalType: (["normal", "terminal", "through-start", "through-end"].includes(row.terminal_type || "") ? row.terminal_type : "normal") as TerminalType,
    isOpen: row.is_open !== "0" && row.is_open !== "false",
    throughLineIds: row.through_line_ids ? row.through_line_ids.split("|").filter(Boolean) : [],
    notes: row.notes || "",
    icon: row.icon || "",
  }));
}

export function transfersFromCsv(rows: CsvRow[]): Transfer[] {
  return rows.map((row) => ({
    id: row.id || "",
    stationId: row.station_id || "",
    targetLineId: row.target_line_id || "",
    order: Number(row.order) || 0,
    colorOverride: row.color_override || "",
    hidden: row.hidden === "1" || row.hidden === "true",
  }));
}

// ── 校验 ──────────────────────────────

export type CsvIssueSeverity = "错误" | "提醒";

export interface CsvImportIssue {
  severity: CsvIssueSeverity;
  category: string;
  message: string;
  fileName?: string;
  rowNumber?: number;
  field?: string;
}

const optionalText = z.string().optional();
const requiredText = z.string().min(1, "不能为空");
const integerText = z.string().regex(/^-?\d+$/, "必须是整数");
const booleanText = z.enum(["0", "1", "true", "false"]).optional();

const ROW_SCHEMAS: Record<CsvFileType, z.ZodType<unknown>> = {
  lines: z.object({
    id: requiredText,
    kind: z.enum(["metro", "tram"]),
    number: optionalText,
    name_zh: requiredText,
    name_en: optionalText,
    code: optionalText,
    line_color: optionalText,
    station_color: optionalText,
    current_color: optionalText,
    passed_color: optionalText,
    text_color: optionalText,
    description: optionalText,
  }).loose(),
  stations: z.object({
    id: requiredText,
    line_id: requiredText,
    sequence: integerText,
    name_zh: requiredText,
    name_en: optionalText,
    code: optionalText,
    marker_color: optionalText,
    terminal_type: z.enum(["normal", "terminal", "through-start", "through-end"]).optional(),
    through_line_ids: optionalText,
    notes: optionalText,
    is_open: booleanText,
    icon: optionalText,
  }).loose(),
  transfers: z.object({
    id: requiredText,
    station_id: requiredText,
    target_line_id: requiredText,
    order: integerText,
    color_override: optionalText,
    hidden: booleanText,
  }).loose(),
};

function validateRows(type: CsvFileType, name: string, rows: CsvRow[]): CsvImportIssue[] {
  const issues: CsvImportIssue[] = [];
  rows.forEach((row, index) => {
    const result = ROW_SCHEMAS[type].safeParse(row);
    if (result.success) return;
    for (const issue of result.error.issues) {
      issues.push({
        severity: "错误",
        category: "行校验",
        message: issue.message,
        fileName: name,
        rowNumber: index + 2,
        field: issue.path.join(".") || undefined,
      });
    }
  });
  return issues;
}

export interface CsvImportPreview {
  lines: TransitLine[];
  stations: Station[];
  transfers: Transfer[];
  issues: CsvImportIssue[];
  /** 导入的文件名列表 */
  files: { type: CsvFileType; name: string; rowCount: number }[];
  /** 缺失的 CSV 类型 */
  missingTypes: CsvFileType[];
  /** 与当前数据的差异摘要 */
  diff: CsvDiffSummary;
}

export interface CsvDiffSummary {
  /** 新增线路数 */
  addedLines: number;
  /** 删除线路数 */
  removedLines: number;
  /** 新增站点数 */
  addedStations: number;
  /** 删除站点数 */
  removedStations: number;
  /** 新增换乘数 */
  addedTransfers: number;
  /** 删除换乘数 */
  removedTransfers: number;
  /** 已存在但字段发生变化的线路数 */
  changedLines: number;
  /** 已存在但字段发生变化的站点数 */
  changedStations: number;
  /** 已存在但字段发生变化的换乘数 */
  changedTransfers: number;
}

function changedCount<T extends { id: string }>(imported: T[], current: T[]): number {
  const currentById = new Map(current.map((item) => [item.id, item]));
  return imported.filter((item) => {
    const previous = currentById.get(item.id);
    return previous !== undefined && JSON.stringify(previous) !== JSON.stringify(item);
  }).length;
}

/** 计算 diff 摘要：比较导入数据与当前数据 */
export function computeDiff(imported: { lines: TransitLine[]; stations: Station[]; transfers: Transfer[] }, current: TransitData): CsvDiffSummary {
  const importedLineIds = new Set(imported.lines.map((l) => l.id));
  const currentLineIds = new Set(current.lines.map((l) => l.id));
  const importedStationIds = new Set(imported.stations.map((s) => s.id));
  const currentStationIds = new Set(current.stations.map((s) => s.id));
  const importedTransferIds = new Set(imported.transfers.map((t) => t.id));
  const currentTransferIds = new Set(current.transfers.map((t) => t.id));

  return {
    addedLines: imported.lines.filter((l) => !currentLineIds.has(l.id)).length,
    removedLines: current.lines.filter((l) => !importedLineIds.has(l.id)).length,
    addedStations: imported.stations.filter((s) => !currentStationIds.has(s.id)).length,
    removedStations: current.stations.filter((s) => !importedStationIds.has(s.id)).length,
    addedTransfers: imported.transfers.filter((t) => !currentTransferIds.has(t.id)).length,
    removedTransfers: current.transfers.filter((t) => !importedTransferIds.has(t.id)).length,
    changedLines: changedCount(imported.lines, current.lines),
    changedStations: changedCount(imported.stations, current.stations),
    changedTransfers: changedCount(imported.transfers, current.transfers),
  };
}

/** 校验导入的 CSV 数据，返回问题列表
 *  importedTypes 用于部分导入场景：仅校验实际导入类型的内部规则及它们之间的跨类型引用，
 *  未导入类型（沿用 current 数据作为回退）不参与校验，避免因新旧数据不一致产生误报。
 */
export function validateCsvImport(
  data: { lines: TransitLine[]; stations: Station[]; transfers: Transfer[] },
  importedTypes?: Set<CsvFileType>,
): CsvImportIssue[] {
  const issues: CsvImportIssue[] = [];
  const shouldValidateLines = !importedTypes || importedTypes.has("lines");
  const shouldValidateStations = !importedTypes || importedTypes.has("stations");
  const shouldValidateTransfers = !importedTypes || importedTypes.has("transfers");

  // ── 线路校验 ──
  if (shouldValidateLines) {
    const lineIds = new Set<string>();
    for (const line of data.lines) {
      if (!line.id) issues.push({ severity: "错误", category: "线路", message: "存在空 ID 的线路" });
      if (lineIds.has(line.id)) issues.push({ severity: "错误", category: "线路", message: `线路 ID 重复：${line.id}` });
      lineIds.add(line.id);
      if (!line.nameZh) issues.push({ severity: "提醒", category: "线路", message: `线路 ${line.id} 缺少中文名称` });
      if (!line.nameEn) issues.push({ severity: "提醒", category: "线路", message: `线路 ${line.id} 缺少英文名称` });
      if (!line.lineColor) issues.push({ severity: "提醒", category: "线路", message: `线路 ${line.id} 缺少线路颜色` });
    }
  }

  // ── 站点校验 ──
  if (shouldValidateStations) {
    const stationIds = new Set<string>();
    const sequences = new Set<string>();
    const codes = new Set<string>();
    // lineIds 取自合并后的数据（未导入 lines 时也包含 current.lines）
    const lineIds = new Set(data.lines.map((l) => l.id));
    for (const station of data.stations) {
      if (!station.id) issues.push({ severity: "错误", category: "站点", message: "存在空 ID 的站点" });
      if (stationIds.has(station.id)) issues.push({ severity: "错误", category: "站点", message: `站点 ID 重复：${station.id}` });
      stationIds.add(station.id);

      if (!lineIds.has(station.lineId)) issues.push({ severity: "错误", category: "站点", message: `站点 ${station.nameZh || station.id} 的所属线路 ${station.lineId} 不存在` });

      const seqKey = `${station.lineId}:${station.sequence}`;
      if (sequences.has(seqKey)) issues.push({ severity: "错误", category: "站点", message: `${station.lineId} 的第 ${station.sequence} 站顺序重复` });
      sequences.add(seqKey);

      if (station.code) {
        const codeKey = `${station.lineId}:${station.code.toLowerCase()}`;
        if (codes.has(codeKey)) issues.push({ severity: "错误", category: "站点", message: `${station.lineId} 的站点代号 ${station.code} 重复` });
        codes.add(codeKey);
      }

      if (!station.nameZh) issues.push({ severity: "错误", category: "站点", message: `站点 ${station.id} 缺少中文站名` });
      if (!station.nameEn) issues.push({ severity: "提醒", category: "站点", message: `站点 ${station.nameZh || station.id} 缺少英文站名` });
    }
  }

  // ── 换乘校验 ──
  if (shouldValidateTransfers) {
    const transferKeys = new Set<string>();
    // stationIds / lineIds 取自合并后的数据
    const stationIds = new Set(data.stations.map((s) => s.id));
    const lineIds = new Set(data.lines.map((l) => l.id));
    for (const transfer of data.transfers) {
      if (!transfer.id) issues.push({ severity: "错误", category: "换乘", message: "存在空 ID 的换乘记录" });
      if (!stationIds.has(transfer.stationId)) issues.push({ severity: "错误", category: "换乘", message: `换乘 ${transfer.id} 指向不存在的站点 ${transfer.stationId}` });
      if (!lineIds.has(transfer.targetLineId)) issues.push({ severity: "错误", category: "换乘", message: `换乘 ${transfer.id} 指向不存在的线路 ${transfer.targetLineId}` });
      const key = `${transfer.stationId}:${transfer.targetLineId}`;
      if (transferKeys.has(key)) issues.push({ severity: "错误", category: "换乘", message: `换乘关系重复：${key}` });
      transferKeys.add(key);
    }
  }

  return issues;
}

// ── 主入口：从文件列表构建预览 ──────────────────────────────

export interface ParsedCsvFile {
  type: CsvFileType;
  name: string;
  rows: CsvRow[];
  issues: CsvImportIssue[];
}

/** 从文件文本解析为结构化 CSV 文件 */
export function parseCsvFile(name: string, text: string): ParsedCsvFile | null {
  const type = detectCsvType(name);
  if (!type) return null;
  const parsed = parseCsvDetailed(text, name);
  return { type, name, rows: parsed.rows, issues: [...parsed.issues, ...validateRows(type, name, parsed.rows)] };
}

/** 从已解析的文件列表构建导入预览 */
export function buildImportPreview(
  files: ParsedCsvFile[],
  current: TransitData,
): CsvImportPreview {
  const fileMap = new Map<CsvFileType, ParsedCsvFile>();
  for (const file of files) fileMap.set(file.type, file);

  const lines = fileMap.has("lines") ? linesFromCsv(fileMap.get("lines")!.rows) : current.lines;
  const stations = fileMap.has("stations") ? stationsFromCsv(fileMap.get("stations")!.rows) : current.stations;
  const transfers = fileMap.has("transfers") ? transfersFromCsv(fileMap.get("transfers")!.rows) : current.transfers;

  const imported = { lines, stations, transfers };
  const importedTypes = new Set<CsvFileType>();
  for (const file of files) importedTypes.add(file.type);

  const issues = [
    ...files.flatMap((file) => file.issues || []),
    ...validateCsvImport(imported, importedTypes),
  ];
  const diff = computeDiff(imported, current);

  const missingTypes = CSV_FILE_PATTERNS
    .filter((p) => !fileMap.has(p.type))
    .map((p) => p.type);

  return {
    lines,
    stations,
    transfers,
    issues,
    files: files.map((f) => ({ type: f.type, name: f.name, rowCount: f.rows.length })),
    missingTypes,
    diff,
  };
}

/** 检查预览是否存在阻断性错误（有错误的导入不允许确认） */
export function hasBlockingIssues(issues: CsvImportIssue[]): boolean {
  return issues.some((issue) => issue.severity === "错误");
}
