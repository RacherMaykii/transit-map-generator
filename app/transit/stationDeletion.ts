// ──────────────────────────────────────────────
// 站点 / 线路级联删除 · 纯函数
// ──────────────────────────────────────────────
// 只负责改造 TransitData（站点表、换乘表、线路表），不触碰 UI 状态，
// 也不触碰配线图。调用方负责单次 commit（一个撤销步骤）。
// 配线图解除关联由 app/wiring 的同步逻辑在下次读取 CSV 时完成。

import type { Station, TransitData, TransitLine } from "./types";

export interface DeleteStationImpact {
  /** 被删除的站点 */
  station: Station;
  /** 本站发出的换乘记录数（stationId === 被删站） */
  removedTransferCount: number;
  /** 其他线路中指向本线路的同名站换乘记录数 */
  reciprocalTransferCount: number;
  /** 删除后所属线路剩余的站点数 */
  remainingStationCount: number;
}

export interface DeleteLineImpact {
  /** 被删除的线路 */
  line: TransitLine;
  /** 该线路删除的站点数 */
  removedStationCount: number;
  /** 删除的换乘记录数（本站换乘 + 指向本线路的换乘） */
  removedTransferCount: number;
  /** 删除后剩余线路数 */
  remainingLineCount: number;
}

export class StationNotFoundError extends Error {
  constructor(stationId: string) {
    super(`找不到要删除的站点：${stationId}`);
    this.name = "StationNotFoundError";
  }
}

export class LineNotFoundError extends Error {
  constructor(lineId: string) {
    super(`找不到要删除的线路：${lineId}`);
    this.name = "LineNotFoundError";
  }
}

/**
 * 规范化中文站名，用于在没有 targetStationId / 物理站映射时判断两个
 * 站是否属于同一个物理站（同名站）。至少处理：
 * - 首尾空格
 * - 中文与英文空格（全角空格、NBSP、零宽空格 → 普通空格）
 * - 连续空格
 * - 全角/半角括号与常用标点差异
 */
export function normalizeStationName(value: string): string {
  return value
    .trim()
    .replace(/[　 ​﻿]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[（]/g, "(")
    .replace(/[）]/g, ")")
    .replace(/[【]/g, "[")
    .replace(/[】]/g, "]")
    .replace(/[《]/g, "<")
    .replace(/[》]/g, ">")
    .replace(/[，]/g, ",")
    .replace(/[。]/g, ".")
    .replace(/[；]/g, ";")
    .replace(/[：]/g, ":")
    .replace(/[？]/g, "?")
    .replace(/[！]/g, "!")
    .replace(/[、]/g, ",")
    .replace(/[·・•]/g, "·")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[—–]/g, "-")
    .trim();
}

function samePhysicalStation(left: Station, right: Station): boolean {
  return normalizeStationName(left.nameZh) === normalizeStationName(right.nameZh);
}

/**
 * 删除一个站点及其影响的数据。
 *
 * - 找不到站点时抛出 StationNotFoundError，不修改数据。
 * - 删除 data.stations 中的目标站点。
 * - 删除所有 transfer.stationId === stationId 的换乘记录。
 * - 清理其他线路中指向被删站所属线路、且与被删站同名的换乘记录。
 * - 对被删站所属线路的剩余站点重新生成连续 sequence。
 * - 不自动修改站点 code，不修改线路样式、线路颜色或其他线路数据。
 */
export function deleteStationCascade(
  data: TransitData,
  stationId: string,
): { data: TransitData; impact: DeleteStationImpact } {
  const station = data.stations.find((item) => item.id === stationId);
  if (!station) throw new StationNotFoundError(stationId);

  const stationById = new Map(data.stations.map((item) => [item.id, item]));

  // 本站发出的换乘记录。
  const ownTransferIds = new Set(
    data.transfers
      .filter((transfer) => transfer.stationId === stationId)
      .map((transfer) => transfer.id),
  );

  // 其他线路中指向本线路、且源站与被删站属于同一物理站（同名）的换乘记录。
  // 只删除同名站的对应换乘，绝不删除全线所有 targetLineId 相同的记录。
  const reciprocalTransferIds = new Set<string>();
  for (const transfer of data.transfers) {
    if (transfer.stationId === stationId) continue;
    if (transfer.targetLineId !== station.lineId) continue;
    const source = stationById.get(transfer.stationId);
    if (!source) continue;
    if (!samePhysicalStation(source, station)) continue;
    reciprocalTransferIds.add(transfer.id);
  }

  const removedTransferCount = ownTransferIds.size;
  const reciprocalTransferCount = reciprocalTransferIds.size;
  const transfers = data.transfers.filter(
    (transfer) => !ownTransferIds.has(transfer.id) && !reciprocalTransferIds.has(transfer.id),
  );

  const remainingStations = data.stations.filter((item) => item.id !== stationId);
  const lineRemaining = remainingStations
    .filter((item) => item.lineId === station.lineId)
    .sort((a, b) => a.sequence - b.sequence)
    .map((item, index) => ({ ...item, sequence: index + 1 }));
  const resequencedById = new Map(lineRemaining.map((item) => [item.id, item]));
  const stations = remainingStations.map((item) => resequencedById.get(item.id) || item);

  return {
    data: { ...data, stations, transfers },
    impact: {
      station,
      removedTransferCount,
      reciprocalTransferCount,
      remainingStationCount: lineRemaining.length,
    },
  };
}

/**
 * 删除一条线路及其全部站点。
 *
 * - 删除目标线路。
 * - 删除该线路全部站点。
 * - 清理相关换乘（本站换乘 + 指向本线路的换乘）。
 * - 删除 lineStyleTemplates[lineId]。
 * - 线路为空站允许保留空线路；本函数删除整条线路，返回单次数据改造。
 * - 找不到线路时抛出 LineNotFoundError，不修改数据。
 */
export function deleteLineCascade(
  data: TransitData,
  lineId: string,
): { data: TransitData; impact: DeleteLineImpact } {
  const line = data.lines.find((item) => item.id === lineId);
  if (!line) throw new LineNotFoundError(lineId);

  const lineStationIds = new Set(
    data.stations.filter((item) => item.lineId === lineId).map((item) => item.id),
  );
  const beforeTransfers = data.transfers;
  const transfers = beforeTransfers.filter((transfer) => {
    if (lineStationIds.has(transfer.stationId)) return false;
    if (transfer.targetLineId === lineId) return false;
    return true;
  });
  const stations = data.stations
    .filter((item) => item.lineId !== lineId)
    .map((item) => item.throughLineIds.includes(lineId)
      ? { ...item, throughLineIds: item.throughLineIds.filter((candidate) => candidate !== lineId) }
      : item);
  const lines = data.lines.filter((item) => item.id !== lineId);

  const lineStyleTemplates = data.lineStyleTemplates ? { ...data.lineStyleTemplates } : undefined;
  if (lineStyleTemplates) delete lineStyleTemplates[lineId];

  return {
    data: {
      ...data,
      lines,
      stations,
      transfers,
      ...(lineStyleTemplates ? { lineStyleTemplates } : {}),
    },
    impact: {
      line,
      removedStationCount: lineStationIds.size,
      removedTransferCount: beforeTransfers.length - transfers.length,
      remainingLineCount: lines.length,
    },
  };
}
