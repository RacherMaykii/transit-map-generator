import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createServer } from "vite";

const server = await createServer({ configFile: false, appType: "custom", server: { middlewareMode: true } });
const deletion = await server.ssrLoadModule("/app/transit/stationDeletion.ts");
after(() => server.close());

function station(overrides = {}) {
  return {
    id: "L1-S01", lineId: "L1", sequence: 1, nameZh: "人民广场", nameEn: "People Square",
    code: "L1-01", markerColor: "#FF0000", terminalType: "normal", isOpen: true,
    throughLineIds: [], notes: "", ...overrides,
  };
}

function line(overrides = {}) {
  return {
    id: "L1", kind: "metro", number: "1", nameZh: "一号线", nameEn: "Line 1", code: "L1",
    lineColor: "#FF0000", stationColor: "#FF0000", currentColor: "#EE0011",
    passedColor: "#999999", textColor: "#FF0000", description: "", ...overrides,
  };
}

function transfer(overrides = {}) {
  return {
    id: "t1", stationId: "L1-S01", targetLineId: "L2", order: 0, colorOverride: "", hidden: false, ...overrides,
  };
}

function transit({ lines = [line()], stations = [station()], transfers = [], lineStyleTemplates = {} } = {}) {
  return {
    schemaVersion: 1, lines, stations, transfers, layout: {}, activeStyleTemplate: "classic",
    layoutTemplates: {}, lineStyleTemplates,
  };
}

test("删除普通站点：站点数减少、剩余站点序号连续", () => {
  const data = transit({
    stations: [
      station({ id: "S1", sequence: 1, code: "L1-01" }),
      station({ id: "S2", sequence: 2, code: "L1-02" }),
      station({ id: "S3", sequence: 3, code: "L1-03" }),
    ],
  });
  const { data: next, impact } = deletion.deleteStationCascade(data, "S2");
  assert.equal(impact.station.id, "S2");
  assert.equal(impact.remainingStationCount, 2);
  assert.equal(next.stations.length, 2);
  assert.deepEqual(next.stations.map((s) => s.id), ["S1", "S3"]);
  assert.deepEqual(next.stations.map((s) => s.sequence), [1, 2]);
});

test("删除站点：不自动修改剩余站点代码", () => {
  const data = transit({
    stations: [
      station({ id: "S1", sequence: 1, code: "L1-01" }),
      station({ id: "S2", sequence: 2, code: "L1-02" }),
      station({ id: "S3", sequence: 3, code: "L1-03" }),
    ],
  });
  const { data: next } = deletion.deleteStationCascade(data, "S2");
  assert.equal(next.stations.find((s) => s.id === "S1").code, "L1-01");
  assert.equal(next.stations.find((s) => s.id === "S3").code, "L1-03");
});

test("删除站点：本站发出的换乘记录全部删除", () => {
  const data = transit({
    stations: [station({ id: "S1", sequence: 1 })],
    transfers: [
      transfer({ id: "t1", stationId: "S1", targetLineId: "L2" }),
      transfer({ id: "t2", stationId: "S1", targetLineId: "L3" }),
    ],
  });
  const { data: next, impact } = deletion.deleteStationCascade(data, "S1");
  assert.equal(impact.removedTransferCount, 2);
  assert.equal(next.transfers.length, 0);
});

test("删除站点：其他线路同名站的换乘被清理", () => {
  const data = transit({
    lines: [line(), line({ id: "L2", number: "2", nameZh: "二号线", code: "L2" })],
    stations: [
      station({ id: "S1", lineId: "L1", nameZh: "人民广场", nameEn: "People Square" }),
      station({ id: "S2", lineId: "L2", nameZh: "人民广场", nameEn: "People Square" }),
    ],
    transfers: [transfer({ id: "t1", stationId: "S2", targetLineId: "L1" })],
  });
  const { data: next, impact } = deletion.deleteStationCascade(data, "S1");
  assert.equal(impact.reciprocalTransferCount, 1);
  assert.equal(next.transfers.length, 0);
});

test("删除站点：其他线路异名站指向本线路的换乘不会被误删", () => {
  const data = transit({
    lines: [line(), line({ id: "L2", number: "2", nameZh: "二号线", code: "L2" })],
    stations: [
      station({ id: "S1", lineId: "L1", nameZh: "人民广场", nameEn: "People Square" }),
      station({ id: "S2", lineId: "L2", nameZh: "南京西路", nameEn: "Nanjing West" }),
    ],
    transfers: [transfer({ id: "t1", stationId: "S2", targetLineId: "L1" })],
  });
  const { data: next, impact } = deletion.deleteStationCascade(data, "S1");
  assert.equal(impact.reciprocalTransferCount, 0);
  assert.equal(next.transfers.length, 1);
  assert.equal(next.transfers[0].id, "t1");
});

test("删除站点：换乘清理只针对同名站，不会误伤指向同线路的其他记录", () => {
  const data = transit({
    lines: [line(), line({ id: "L2", number: "2", nameZh: "二号线", code: "L2" })],
    stations: [
      station({ id: "S1", lineId: "L1", nameZh: "人民广场" }),
      station({ id: "S2", lineId: "L2", nameZh: "人民广场" }),
      station({ id: "S3", lineId: "L2", nameZh: "徐家汇" }),
    ],
    transfers: [
      transfer({ id: "same", stationId: "S2", targetLineId: "L1" }),
      transfer({ id: "other", stationId: "S3", targetLineId: "L1" }),
    ],
  });
  const { data: next } = deletion.deleteStationCascade(data, "S1");
  assert.deepEqual(next.transfers.map((t) => t.id), ["other"]);
});

test("删除站点：删除线路最后一个站后线路保留为空线", () => {
  const data = transit({ stations: [station({ id: "S1", sequence: 1 })] });
  const { data: next, impact } = deletion.deleteStationCascade(data, "S1");
  assert.equal(impact.remainingStationCount, 0);
  assert.equal(next.stations.length, 0);
  assert.equal(next.lines.length, 1);
  assert.equal(next.lines[0].id, "L1");
});

test("删除站点：站点不存在时抛错且不修改数据", () => {
  const data = transit();
  assert.throws(() => deletion.deleteStationCascade(data, "nope"), deletion.StationNotFoundError);
  assert.equal(data.stations.length, 1);
});

test("normalizeStationName 处理空格与全半角标点差异", () => {
  assert.equal(deletion.normalizeStationName("  人民广场  "), "人民广场");
  assert.equal(deletion.normalizeStationName("人民　广场"), "人民 广场");
  assert.equal(deletion.normalizeStationName("人民 广场"), "人民 广场");
  assert.equal(deletion.normalizeStationName("人民​广场"), "人民 广场");
  assert.equal(deletion.normalizeStationName("东单（1号线）"), "东单(1号线)");
  assert.equal(deletion.normalizeStationName("东单(1号线)"), "东单(1号线)");
  assert.equal(deletion.normalizeStationName("  A  B  "), "A B");
  assert.equal(deletion.normalizeStationName("一、二"), "一,二");
});

test("删除线路：线路、站点、相关换乘与样式模板一并删除", () => {
  const data = transit({
    lines: [line(), line({ id: "L2", number: "2", nameZh: "二号线", code: "L2" })],
    stations: [
      station({ id: "S1", lineId: "L1", sequence: 1 }),
      station({ id: "S2", lineId: "L1", sequence: 2 }),
      station({ id: "S3", lineId: "L2", sequence: 1 }),
    ],
    transfers: [
      transfer({ id: "t1", stationId: "S1", targetLineId: "L2" }),
      transfer({ id: "t2", stationId: "S3", targetLineId: "L1" }),
      transfer({ id: "t3", stationId: "S3", targetLineId: "L3" }),
    ],
    lineStyleTemplates: { L1: "loop", L2: "classic" },
  });
  const { data: next, impact } = deletion.deleteLineCascade(data, "L1");
  assert.equal(impact.removedStationCount, 2);
  assert.equal(impact.removedTransferCount, 2);
  assert.equal(impact.remainingLineCount, 1);
  assert.deepEqual(next.lines.map((l) => l.id), ["L2"]);
  assert.deepEqual(next.stations.map((s) => s.id), ["S3"]);
  assert.deepEqual(next.transfers.map((t) => t.id), ["t3"]);
  assert.equal(next.lineStyleTemplates.L1, undefined);
  assert.equal(next.lineStyleTemplates.L2, "classic");
});

test("删除线路：清理其他线路站点中的贯通线路引用", () => {
  const data = transit({
    lines: [line(), line({ id: "L2", number: "2", nameZh: "二号线", code: "L2" })],
    stations: [
      station({ id: "S1", lineId: "L1", throughLineIds: [] }),
      station({ id: "S2", lineId: "L2", throughLineIds: ["L1", "L3"] }),
    ],
  });
  const { data: next } = deletion.deleteLineCascade(data, "L1");
  assert.deepEqual(next.stations[0].throughLineIds, ["L3"]);
  assert.deepEqual(data.stations[1].throughLineIds, ["L1", "L3"], "输入数据保持不变");
});

test("删除线路：线路不存在时抛错且不修改数据", () => {
  const data = transit();
  assert.throws(() => deletion.deleteLineCascade(data, "nope"), deletion.LineNotFoundError);
  assert.equal(data.lines.length, 1);
});

test("撤销恢复：删除前的完整快照可精确恢复站点与换乘", () => {
  const data = transit({
    lines: [line(), line({ id: "L2", number: "2", nameZh: "二号线", code: "L2" })],
    stations: [
      station({ id: "S1", lineId: "L1", sequence: 1, nameZh: "人民广场" }),
      station({ id: "S2", lineId: "L1", sequence: 2, nameZh: "黄陂南路" }),
      station({ id: "S3", lineId: "L2", sequence: 1, nameZh: "人民广场" }),
    ],
    transfers: [
      transfer({ id: "t1", stationId: "S1", targetLineId: "L2" }),
      transfer({ id: "t2", stationId: "S3", targetLineId: "L1" }),
    ],
  });
  const before = structuredClone(data);
  const { data: next } = deletion.deleteStationCascade(data, "S1");
  assert.deepEqual(next.stations.map((s) => s.id), ["S2", "S3"]);
  assert.deepEqual(next.transfers.map((t) => t.id), []);
  // 撤销 = 用删除前快照恢复，全部内容一致。
  assert.deepEqual(before.stations.map((s) => s.id), ["S1", "S2", "S3"]);
  assert.deepEqual(before.transfers.map((t) => t.id), ["t1", "t2"]);
  assert.deepEqual(before.stations.map((s) => s.sequence), [1, 2, 1]);
});

test("工程隔离：删除只作用于传入的数据，其它工程数据不受影响", () => {
  const projectA = transit({
    stations: [station({ id: "S1", sequence: 1 }), station({ id: "S2", sequence: 2 })],
  });
  const projectB = transit({ stations: [station({ id: "B1", sequence: 1, nameZh: "独立站" })] });
  const { data: nextA } = deletion.deleteStationCascade(projectA, "S1");
  assert.equal(nextA.stations.length, 1);
  // 删除函数不修改入参对象（纯函数）。
  assert.equal(projectA.stations.length, 2);
  assert.equal(projectB.stations.length, 1);
  assert.equal(projectB.stations[0].id, "B1");
});
