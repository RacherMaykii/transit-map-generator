import { Station, TransitData, TransitLine, stationsForLine } from "./types";

export type AuditCategory = "换乘" | "英文" | "结构";
export type AuditSeverity = "错误" | "提醒";

export interface StationAuditIssue {
  id: string;
  category: AuditCategory;
  severity: AuditSeverity;
  title: string;
  detail: string;
  stationId?: string;
  lineId?: string;
}

export interface LineOpeningStats {
  line: TransitLine;
  isOpen: boolean;
  openStations: Station[];
  closedStations: Station[];
}

export interface OpeningStats {
  openLineCount: number;
  totalLineCount: number;
  openPhysicalStationCount: number;
  openLineStationCount: number;
  openTransferStationCount: number;
  lines: LineOpeningStats[];
}

const CJK_PATTERN = /[\u3400-\u9fff]/;
const OCR_PATTERNS: Array<[RegExp, string]> = [
  [/\bLslet\b/i, "疑似把 Islet 误写为 Lslet"],
  [/\bPeoples\s+Hospital\b/i, "People's Hospital 可能缺少撇号"],
  [/\bVoidCity\b/i, "Void City 可能缺少空格"],
  [/\bMuseurn\b/i, "Museum 可能存在 OCR 字母错误"],
  [/\bStatlon\b/i, "Station 可能存在 OCR 字母错误"],
];

const COMBINED_LINE_FAMILIES = [
  { key: "R1-79", lineIds: ["R1", "L7", "L9"], label: "R1线（7/9号组合环线）" },
] as const;

function serviceKey(lineId: string) {
  return COMBINED_LINE_FAMILIES.find((family) => family.lineIds.some((candidate) => candidate === lineId))?.key || lineId;
}

function serviceLabel(data: TransitData, lineIds: string[]) {
  const family = COMBINED_LINE_FAMILIES.find((candidate) => lineIds.some((lineId) => candidate.lineIds.some((familyLineId) => familyLineId === lineId)));
  return family?.label || lineLabel(data, lineIds[0]);
}

function cleanName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function lineLabel(data: TransitData, lineId: string) {
  const line = data.lines.find((candidate) => candidate.id === lineId);
  return line ? `${line.nameZh}（${line.code}）` : lineId;
}

export function auditTransitData(data: TransitData): StationAuditIssue[] {
  const issues: StationAuditIssue[] = [];
  const stationIds = new Set<string>();
  const lineSequences = new Set<string>();
  const lineCodes = new Set<string>();
  const stationById = new Map(data.stations.map((station) => [station.id, station]));
  const stationsByZh = new Map<string, Station[]>();

  for (const station of data.stations) {
    const stationName = cleanName(station.nameZh);
    const group = stationsByZh.get(stationName) || [];
    if (stationName) stationsByZh.set(stationName, [...group, station]);

    if (stationIds.has(station.id)) {
      issues.push({ id: `duplicate-id-${station.id}`, category: "结构", severity: "错误", title: "站点 ID 重复", detail: station.id, stationId: station.id, lineId: station.lineId });
    }
    stationIds.add(station.id);

    const sequenceKey = `${station.lineId}:${station.sequence}`;
    if (lineSequences.has(sequenceKey)) {
      issues.push({ id: `duplicate-sequence-${sequenceKey}`, category: "结构", severity: "错误", title: "同一线路存在重复顺序", detail: `${lineLabel(data, station.lineId)}的第 ${station.sequence} 站重复`, stationId: station.id, lineId: station.lineId });
    }
    lineSequences.add(sequenceKey);

    const codeKey = `${station.lineId}:${station.code.trim().toLowerCase()}`;
    if (station.code.trim() && lineCodes.has(codeKey)) {
      issues.push({ id: `duplicate-code-${codeKey}`, category: "结构", severity: "错误", title: "同一线路存在重复站点代号", detail: station.code, stationId: station.id, lineId: station.lineId });
    }
    if (station.code.trim()) lineCodes.add(codeKey);

    if (!stationName) issues.push({ id: `missing-zh-${station.id}`, category: "结构", severity: "错误", title: "缺少中文站名", detail: lineLabel(data, station.lineId), stationId: station.id, lineId: station.lineId });
    if (!station.nameEn.trim()) issues.push({ id: `missing-en-${station.id}`, category: "英文", severity: "错误", title: "缺少英文站名", detail: `${station.nameZh || station.id}尚未填写英文`, stationId: station.id, lineId: station.lineId });
    if (!station.code.trim()) issues.push({ id: `missing-code-${station.id}`, category: "结构", severity: "提醒", title: "缺少站点代号", detail: station.nameZh || station.id, stationId: station.id, lineId: station.lineId });

    const english = station.nameEn;
    if (english && CJK_PATTERN.test(english)) issues.push({ id: `cjk-en-${station.id}`, category: "英文", severity: "错误", title: "英文站名中含中文", detail: english, stationId: station.id, lineId: station.lineId });
    if (english && english !== cleanName(english)) issues.push({ id: `spacing-en-${station.id}`, category: "英文", severity: "提醒", title: "英文空格不规范", detail: `建议改为：${cleanName(english)}`, stationId: station.id, lineId: station.lineId });
    for (const [pattern, message] of OCR_PATTERNS) {
      if (pattern.test(english)) issues.push({ id: `ocr-${station.id}-${pattern.source}`, category: "英文", severity: "提醒", title: "疑似英文识别错误", detail: `${english}；${message}`, stationId: station.id, lineId: station.lineId });
    }
  }

  for (const [nameZh, stationGroup] of stationsByZh) {
    const englishVariants = new Map<string, Station[]>();
    for (const station of stationGroup) {
      const normalized = cleanName(station.nameEn).toLowerCase();
      if (!normalized) continue;
      englishVariants.set(normalized, [...(englishVariants.get(normalized) || []), station]);
    }
    if (englishVariants.size > 1) {
      const variants = [...englishVariants.values()].map((items) => items[0].nameEn).join(" / ");
      for (const station of stationGroup) {
        issues.push({ id: `inconsistent-en-${station.id}`, category: "英文", severity: "提醒", title: "同名站英文不一致", detail: `${nameZh}：${variants}`, stationId: station.id, lineId: station.lineId });
      }
    }

    const services = new Map<string, string[]>();
    for (const station of stationGroup) {
      const key = serviceKey(station.lineId);
      services.set(key, [...(services.get(key) || []), station.lineId]);
    }
    if (services.size > 1) {
      for (const station of stationGroup) {
        const ownService = serviceKey(station.lineId);
        const actualServices = new Set(data.transfers.filter((transfer) => transfer.stationId === station.id).map((transfer) => serviceKey(transfer.targetLineId)));
        for (const [expectedService, expectedLineIds] of services) {
          if (expectedService === ownService || actualServices.has(expectedService)) continue;
          issues.push({
            id: `missing-transfer-${station.id}-${expectedService}`,
            category: "换乘",
            severity: "错误",
            title: "同名站可能漏标换乘",
            detail: `${nameZh}在${lineLabel(data, station.lineId)}缺少前往${serviceLabel(data, expectedLineIds)}的换乘标记`,
            stationId: station.id,
            lineId: station.lineId,
          });
        }
      }
    }
  }

  const transferKeys = new Set<string>();
  const transferServiceKeys = new Set<string>();
  for (const transfer of data.transfers) {
    const station = stationById.get(transfer.stationId);
    if (!station) {
      issues.push({ id: `orphan-transfer-${transfer.id}`, category: "换乘", severity: "错误", title: "换乘指向不存在的站点", detail: transfer.stationId });
      continue;
    }
    if (!data.lines.some((line) => line.id === transfer.targetLineId)) {
      issues.push({ id: `missing-target-${transfer.id}`, category: "换乘", severity: "错误", title: "换乘目标线路不存在", detail: transfer.targetLineId, stationId: station.id, lineId: station.lineId });
    } else if (!data.stations.some((candidate) => serviceKey(candidate.lineId) === serviceKey(transfer.targetLineId) && cleanName(candidate.nameZh) === cleanName(station.nameZh))) {
      issues.push({ id: `unmatched-transfer-${transfer.id}`, category: "换乘", severity: "提醒", title: "换乘线路没有同名站", detail: `${station.nameZh} → ${lineLabel(data, transfer.targetLineId)}；请核对站名或换乘关系`, stationId: station.id, lineId: station.lineId });
    }
    const key = `${transfer.stationId}:${transfer.targetLineId}`;
    if (transferKeys.has(key)) issues.push({ id: `duplicate-transfer-${transfer.id}`, category: "换乘", severity: "错误", title: "重复换乘记录", detail: `${station.nameZh} → ${lineLabel(data, transfer.targetLineId)}`, stationId: station.id, lineId: station.lineId });
    const serviceTransferKey = `${transfer.stationId}:${serviceKey(transfer.targetLineId)}`;
    if (!transferKeys.has(key) && transferServiceKeys.has(serviceTransferKey)) {
      const family = COMBINED_LINE_FAMILIES.find((candidate) => candidate.key === serviceKey(transfer.targetLineId));
      issues.push({ id: `duplicate-combined-transfer-${transfer.id}`, category: "换乘", severity: "提醒", title: "组合环线重复标记", detail: `${station.nameZh}已标记${family?.label || "同一组合线路"}；保留一个换乘标记即可`, stationId: station.id, lineId: station.lineId });
    }
    transferKeys.add(key);
    transferServiceKeys.add(serviceTransferKey);
  }

  return issues.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "错误" ? -1 : 1) || a.category.localeCompare(b.category, "zh-CN"));
}

export function calculateOpeningStats(data: TransitData): OpeningStats {
  const lines = data.lines.map((line) => {
    const stations = stationsForLine(data, line.id);
    const openStations = stations.filter((station) => station.isOpen !== false);
    const closedStations = stations.filter((station) => station.isOpen === false);
    return { line, isOpen: openStations.length > 0, openStations, closedStations };
  });
  const openStations = data.stations.filter((station) => station.isOpen !== false);
  const openPhysicalNames = new Set(openStations.map((station) => cleanName(station.nameZh)).filter(Boolean));
  const openLinesByName = new Map<string, Set<string>>();
  for (const station of openStations) {
    const name = cleanName(station.nameZh);
    if (!name) continue;
    const lineIds = openLinesByName.get(name) || new Set<string>();
    lineIds.add(station.lineId);
    openLinesByName.set(name, lineIds);
  }
  return {
    openLineCount: lines.filter((item) => item.isOpen).length,
    totalLineCount: lines.length,
    openPhysicalStationCount: openPhysicalNames.size,
    openLineStationCount: openStations.length,
    openTransferStationCount: [...openLinesByName.values()].filter((lineIds) => lineIds.size >= 2).length,
    lines,
  };
}
