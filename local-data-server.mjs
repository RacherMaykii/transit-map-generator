import http from "node:http";
import { copyFile, mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(ROOT, "data");
const WEB_ICONS_DIR = path.join(ROOT, "public", "sample-icons");
const PROJECTS_ROOT = path.join(DATA_DIR, "projects");
const LAYOUT_TEMPLATES_FILE = "layout-templates.json";
const DEFAULT_PROJECT_ID = "default";
const PORT = Number(process.env.TRANSIT_DATA_PORT || 4175);
const CSV_FILES = ["lines.csv", "stations.csv", "transfers.csv"];
const EMPTY_PROJECT_CSV = {
  "lines.csv": stringifyCsv(["id", "kind", "number", "name_zh", "name_en", "code", "line_color", "station_color", "current_color", "passed_color", "text_color", "description"], []),
  "stations.csv": stringifyCsv(["id", "line_id", "sequence", "name_zh", "name_en", "code", "marker_color", "terminal_type", "through_line_ids", "notes", "is_open", "icon"], []),
  "transfers.csv": stringifyCsv(["id", "station_id", "target_line_id", "order", "color_override", "hidden"], []),
};
const ICON_EXTENSIONS = new Set([".ico", ".jpg", ".jpeg", ".png"]);
const CUSTOM_ASSET_MANIFEST = "custom-assets.json";

/** Resolves a project id to its data directory; the default project lives at data/ itself. */
function projectRoot(projectId) {
  const id = projectId || DEFAULT_PROJECT_ID;
  if (id === DEFAULT_PROJECT_ID) return DATA_DIR;
  if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error("项目标识无效");
  return path.join(PROJECTS_ROOT, id);
}

function parseCsv(input) {
  const text = input.replace(/^\uFEFF+/, "");
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field.replace(/\r$/, ""));
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  row.push(field.replace(/\r$/, ""));
  if (row.some((value) => value !== "")) rows.push(row);
  if (!rows.length) return [];
  const headers = rows[0];
  return rows.slice(1).map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function stringifyCsv(headers, rows) {
  return `\uFEFF${[headers, ...rows.map((row) => headers.map((header) => row[header] ?? ""))]
    .map((row) => row.map(csvCell).join(","))
    .join("\r\n")}\r\n`;
}

function linesFromCsv(rows) {
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind === "tram" ? "tram" : "metro",
    number: row.number,
    nameZh: row.name_zh,
    nameEn: row.name_en,
    code: row.code,
    lineColor: row.line_color,
    stationColor: row.station_color,
    currentColor: row.current_color,
    passedColor: row.passed_color,
    textColor: row.text_color,
    description: row.description,
  }));
}

function stationsFromCsv(rows) {
  return rows.map((row) => ({
    id: row.id,
    lineId: row.line_id,
    sequence: Number(row.sequence) || 0,
    nameZh: row.name_zh,
    nameEn: row.name_en,
    code: row.code,
    markerColor: row.marker_color,
    terminalType: row.terminal_type || "normal",
    isOpen: row.is_open !== "0" && row.is_open !== "false",
    throughLineIds: row.through_line_ids ? row.through_line_ids.split("|").filter(Boolean) : [],
    notes: row.notes,
    icon: row.icon || "",
  }));
}

function transfersFromCsv(rows) {
  return rows.map((row) => ({
    id: row.id,
    stationId: row.station_id,
    targetLineId: row.target_line_id,
    order: Number(row.order) || 0,
    colorOverride: row.color_override,
    hidden: row.hidden === "1" || row.hidden === "true",
  }));
}

async function loadData(dir) {
  const [linesCsv, stationsCsv, transfersCsv, layoutJson, layoutTemplatesJson] = await Promise.all([
    readFile(path.join(dir, "lines.csv"), "utf8"),
    readFile(path.join(dir, "stations.csv"), "utf8"),
    readFile(path.join(dir, "transfers.csv"), "utf8"),
    readFile(path.join(dir, "layout.json"), "utf8"),
    readFile(path.join(dir, LAYOUT_TEMPLATES_FILE), "utf8").catch((error) => error?.code === "ENOENT" ? "" : Promise.reject(error)),
  ]);
  const legacyLayout = JSON.parse(layoutJson);
  const stored = layoutTemplatesJson ? JSON.parse(layoutTemplatesJson) : null;
  const isStyleTemplate = (value) => ["classic", "loop", "scenic", "pulse"].includes(value);
  const activeStyleTemplate = isStyleTemplate(stored?.activeStyleTemplate) ? stored.activeStyleTemplate : "classic";
  const cloneLayout = (layout) => JSON.parse(JSON.stringify(layout));
  const defaultLoopLayout = {
    ...cloneLayout(legacyLayout),
    schemaVersion: 10,
    lineY: 58,
    lineWidth: 6,
    stationRadius: 12,
    stationRingWidth: 4,
    loopArcDepth: 26,
    loopBottomBarHeight: 10,
    loopDirectionMarkerSize: 7,
    loopDirectionMarkerOffset: 8,
    loopDirectionIconSize: 48,
    loopDirectionBadgeX: 64,
    loopDirectionBadgeY: 7,
    loopDirectionBadgeWidth: 56,
    loopDirectionBadgeHeight: 16,
    loopDirectionBadgeRadius: 7,
    loopDirectionBadgeFontSize: 10,
    loopDirectionLineNameX: 64,
    loopDirectionLineNameY: 40,
    loopDirectionLineNameFontSize: 14,
    loopDirectionIconX: 64,
    loopDirectionIconY: 38,
    loopDirectionLoopTextX: 64,
    loopDirectionLoopTextY: 94,
    loopDirectionLoopTextFontSize: 14,
    loopDirectionRunTextX: 64,
    loopDirectionRunTextY: 110,
    loopDirectionRunTextFontSize: 14,
    loopTransferBadgeHeight: 17,
    loopTransferBadgeFontSize: 8,
    loopTransferBadgeGap: 3,
    loopStationZhOffset: 44,
    loopStationEnOffset: 30,
  };
  const defaultScenicLayout = {
    ...cloneLayout(legacyLayout),
    schemaVersion: 10,
    lineY: 58,
    lineWidth: 4,
    stationRadius: 16,
    stationRingWidth: 2.5,
    stationZhFontSize: 14,
    stationEnFontSize: 9,
    stationEnMinFontSize: 5,
    transferFontSize: 12,
    tramTransferFontSize: 8,
    scenicStationRectWidth: 44,
    scenicStationRectHeight: 32,
    scenicStationRectRadius: 6,
    scenicStationRectBorderWidth: 2.5,
    scenicStationIconSize: 54,
    scenicStationIconPadding: 4,
    scenicStationZhY: 94,
    scenicStationEnY: 108,
    scenicBarHeight: 15,
    scenicBarY: 58,
    scenicDirectionBarHeight: 15,
    scenicDirectionBarY: 58,
    directionArrowOutlineWidth: 2,
  };
  const layoutTemplates = {
    classic: stored?.layoutTemplates?.classic || legacyLayout,
    loop: stored?.layoutTemplates?.loop || defaultLoopLayout,
    scenic: stored?.layoutTemplates?.scenic || defaultScenicLayout,
    pulse: stored?.layoutTemplates?.pulse || defaultScenicLayout,
  };
  const lines = linesFromCsv(parseCsv(linesCsv));
  const lineStyleTemplates = Object.fromEntries(lines.map((line) => [
    line.id,
    isStyleTemplate(stored?.lineStyleTemplates?.[line.id]) ? stored.lineStyleTemplates[line.id] : activeStyleTemplate,
  ]));
  return {
    schemaVersion: 1,
    lines,
    stations: stationsFromCsv(parseCsv(stationsCsv)),
    transfers: transfersFromCsv(parseCsv(transfersCsv)),
    activeStyleTemplate,
    layoutTemplates,
    lineStyleTemplates,
    layout: layoutTemplates[activeStyleTemplate],
  };
}

function lineRows(lines) {
  return lines.map((line) => ({
    id: line.id,
    kind: line.kind,
    number: line.number,
    name_zh: line.nameZh,
    name_en: line.nameEn,
    code: line.code,
    line_color: line.lineColor,
    station_color: line.stationColor,
    current_color: line.currentColor,
    passed_color: line.passedColor,
    text_color: line.textColor,
    description: line.description,
  }));
}

function stationRows(stations) {
  return stations.map((station) => ({
    id: station.id,
    line_id: station.lineId,
    sequence: station.sequence,
    name_zh: station.nameZh,
    name_en: station.nameEn,
    code: station.code,
    marker_color: station.markerColor,
    terminal_type: station.terminalType,
    is_open: station.isOpen === false ? "0" : "1",
    through_line_ids: (station.throughLineIds || []).join("|"),
    notes: station.notes,
    icon: station.icon || "",
  }));
}

function transferRows(transfers) {
  return transfers.map((transfer) => ({
    id: transfer.id,
    station_id: transfer.stationId,
    target_line_id: transfer.targetLineId,
    order: transfer.order,
    color_override: transfer.colorOverride,
    hidden: transfer.hidden ? "1" : "",
  }));
}

async function atomicWrite(filePath, content) {
  const temporary = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporary, content, "utf8");
  await rename(temporary, filePath);
}

async function snapshotCurrent(kind = "snapshot", dir, filenames = CSV_FILES) {
  const historyDir = path.join(dir, "history");
  await mkdir(historyDir, { recursive: true });
  const id = `${kind}-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const destination = path.join(historyDir, id);
  await mkdir(destination, { recursive: true });
  await Promise.all(filenames.map((name) => copyFile(path.join(dir, name), path.join(destination, name))));
  return id;
}

function validateData(data) {
  if (!data || !Array.isArray(data.lines) || !Array.isArray(data.stations) || !Array.isArray(data.transfers)) {
    throw new Error("数据结构无效");
  }
  const lineIds = new Set(data.lines.map((line) => line.id));
  if (lineIds.size !== data.lines.length) throw new Error("线路 ID 不能重复");
  const stationIds = new Set(data.stations.map((station) => station.id));
  if (stationIds.size !== data.stations.length) throw new Error("站点 ID 不能重复");
  for (const station of data.stations) {
    if (!lineIds.has(station.lineId)) throw new Error(`站点 ${station.nameZh} 缺少所属线路`);
  }
  const transferKeys = new Set();
  for (const transfer of data.transfers) {
    if (!stationIds.has(transfer.stationId)) throw new Error(`换乘 ${transfer.id} 指向不存在的站点 ${transfer.stationId}`);
    if (!lineIds.has(transfer.targetLineId)) throw new Error(`换乘 ${transfer.id} 指向不存在的线路 ${transfer.targetLineId}`);
    const key = `${transfer.stationId}:${transfer.targetLineId}`;
    if (transferKeys.has(key)) throw new Error(`换乘关系重复：${key}`);
    transferKeys.add(key);
  }
}

async function saveData(data, dir) {
  validateData(data);
  await Promise.all([
    atomicWrite(path.join(dir, "lines.csv"), stringifyCsv(
      ["id", "kind", "number", "name_zh", "name_en", "code", "line_color", "station_color", "current_color", "passed_color", "text_color", "description"],
      lineRows(data.lines),
    )),
    atomicWrite(path.join(dir, "stations.csv"), stringifyCsv(
      ["id", "line_id", "sequence", "name_zh", "name_en", "code", "marker_color", "terminal_type", "through_line_ids", "notes", "is_open", "icon"],
      stationRows(data.stations),
    )),
    atomicWrite(path.join(dir, "transfers.csv"), stringifyCsv(
      ["id", "station_id", "target_line_id", "order", "color_override", "hidden"],
      transferRows(data.transfers),
    )),
  ]);
  await touchProject(dir);
  return snapshotCurrent("saved", dir);
}

async function saveLayout(activeStyleTemplate, layoutTemplates, lineStyleTemplates = {}, dir) {
  const active = ["classic", "loop", "scenic", "pulse"].includes(activeStyleTemplate) ? activeStyleTemplate : "classic";
  if (!layoutTemplates || typeof layoutTemplates !== "object" || Array.isArray(layoutTemplates)) throw new Error("显示设置模板结构无效");
  for (const template of ["classic", "loop", "scenic", "pulse"]) {
    if (!layoutTemplates[template] || typeof layoutTemplates[template] !== "object" || Array.isArray(layoutTemplates[template])) throw new Error(`${template} 模板设置无效`);
  }
  if (!lineStyleTemplates || typeof lineStyleTemplates !== "object" || Array.isArray(lineStyleTemplates)) throw new Error("线路样式绑定无效");
  const safeLineStyles = Object.fromEntries(Object.entries(lineStyleTemplates).filter(([, template]) => ["classic", "loop", "scenic", "pulse"].includes(template)));
  const store = { schemaVersion: 2, activeStyleTemplate: active, layoutTemplates, lineStyleTemplates: safeLineStyles };
  await Promise.all([
    atomicWrite(path.join(dir, LAYOUT_TEMPLATES_FILE), `${JSON.stringify(store, null, 2)}\n`),
    atomicWrite(path.join(dir, "layout.json"), `${JSON.stringify(layoutTemplates.classic, null, 2)}\n`),
  ]);
  await touchProject(dir);
  return { ...store, layout: layoutTemplates[active] };
}

/** Updates a project directory's updatedAt after a save. The default project has no metadata file. */
async function touchProject(dir) {
  if (dir === DATA_DIR) return;
  const metaFile = path.join(dir, "project.json");
  const meta = await readFile(metaFile, "utf8").then(JSON.parse).catch(() => null);
  if (!meta) return;
  meta.updatedAt = new Date().toISOString();
  await writeFile(metaFile, `${JSON.stringify(meta, null, 2)}\n`, "utf8");
}

function revisionKind(id) {
  if (id.startsWith("saved-")) return "saved";
  if (id.startsWith("before-save-")) return "before-save";
  if (id.startsWith("before-restore-")) return "before-restore";
  if (id.startsWith("map-import-")) return "import";
  return "legacy";
}

async function listRevisions(dir) {
  const historyDir = path.join(dir, "history");
  await mkdir(historyDir, { recursive: true });
  const entries = await readdir(historyDir, { withFileTypes: true });
  const revisions = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (revisionKind(entry.name) !== "saved") continue;
    const info = await stat(path.join(historyDir, entry.name));
    revisions.push({ id: entry.name, createdAt: info.birthtime.toISOString(), kind: revisionKind(entry.name) });
  }
  return revisions.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

async function restoreRevision(id, dir) {
  if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error("历史版本标识无效");
  const historyDir = path.join(dir, "history");
  const source = path.join(historyDir, id);
  const resolved = path.resolve(source);
  if (!resolved.startsWith(path.resolve(historyDir) + path.sep)) throw new Error("历史版本路径无效");
  await Promise.all(CSV_FILES.map((name) => copyFile(path.join(source, name), path.join(dir, name))));
  return loadData(dir);
}

async function listIcons(dir) {
  const directories = [path.join(dir, "icons")];
  if (path.resolve(dir) !== path.resolve(DATA_DIR)) directories.push(path.join(DATA_DIR, "icons"));
  directories.push(WEB_ICONS_DIR);
  const names = new Set();
  for (const iconsDir of directories) {
    await mkdir(iconsDir, { recursive: true }).catch(() => {});
    const entries = await readdir(iconsDir, { withFileTypes: true }).catch(() => []);
    entries
      .filter((entry) => entry.isFile() && ICON_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
      .forEach((entry) => names.add(entry.name));
  }
  return [...names]
    .sort((a, b) => a.localeCompare(b, "zh-CN"));
}

async function listCustomAssets(dir) {
  const manifestPath = path.join(dir, CUSTOM_ASSET_MANIFEST);
  const parsed = await readFile(manifestPath, "utf8").then((text) => JSON.parse(text)).catch(() => []);
  return Array.isArray(parsed) ? parsed.filter((name) => typeof name === "string").sort((a, b) => a.localeCompare(b, "zh-CN")) : [];
}

async function rememberCustomAsset(dir, name) {
  const names = await listCustomAssets(dir);
  if (names.includes(name)) return;
  await writeFile(path.join(dir, CUSTOM_ASSET_MANIFEST), `${JSON.stringify([...names, name], null, 2)}\n`, "utf8");
}

async function forgetCustomAsset(dir, name) {
  const names = (await listCustomAssets(dir)).filter((candidate) => candidate !== name);
  await writeFile(path.join(dir, CUSTOM_ASSET_MANIFEST), `${JSON.stringify(names, null, 2)}\n`, "utf8");
}

function safeIconName(name) {
  const base = path.basename(name).replace(/[\\/:*?"<>|]/g, "-").trim();
  const ext = path.extname(base).toLowerCase();
  if (!ICON_EXTENSIONS.has(ext)) return null;
  const body = base.slice(0, -ext.length) || "icon";
  return `${body.replace(/\s+/g, "-")}${ext}`;
}

async function saveIconUpload(originalName, base64Data, dir) {
  const name = safeIconName(originalName);
  if (!name) throw new Error("仅支持 ico、jpg、jpeg、png 格式的图标");
  const buffer = Buffer.from(base64Data, "base64");
  if (!buffer.length) throw new Error("图标文件内容为空");
  const iconsDir = path.join(dir, "icons");
  await mkdir(iconsDir, { recursive: true });
  const destination = path.join(iconsDir, name);
  await writeFile(destination, buffer);
  await rememberCustomAsset(dir, name);
  return name;
}

async function readIcon(name, dir) {
  const safe = safeIconName(name);
  if (!safe) throw new Error("图标格式无效");
  // 查找顺序：工程自有 icons → data/icons（默认工程的自定义上传）→ public/sample-icons（网页内置图标）
  const candidates = [path.join(dir, "icons", safe)];
  if (path.resolve(dir) !== path.resolve(DATA_DIR)) candidates.push(path.join(DATA_DIR, "icons", safe));
  candidates.push(path.join(WEB_ICONS_DIR, safe));
  let lastError;
  for (const filePath of candidates) {
    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(path.resolve(path.dirname(filePath)) + path.sep)) throw new Error("图标路径无效");
    try {
      return await readFile(resolved);
    } catch (error) {
      if (error?.code === "ENOENT") { lastError = error; continue; }
      throw error;
    }
  }
  throw lastError || new Error("图标不存在");
}

async function deleteIcon(name, dir) {
  const safe = safeIconName(name);
  if (!safe) throw new Error("图标格式无效");
  const iconsDir = path.join(dir, "icons");
  const filePath = path.join(iconsDir, safe);
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(iconsDir) + path.sep)) throw new Error("图标路径无效");
  await rm(resolved, { force: true });
  await forgetCustomAsset(dir, safe);
}

function iconMimeType(name) {
  const ext = path.extname(name).toLowerCase();
  if (ext === ".ico") return "image/x-icon";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".png") return "image/png";
  return "application/octet-stream";
}

function sendIcon(response, status, name, buffer) {
  response.writeHead(status, {
    "Content-Type": iconMimeType(name),
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "no-store",
  });
  response.end(buffer);
}

function sendJson(response, status, body) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 5_000_000) throw new Error("请求数据过大");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function safeProjectName(name) {
  return String(name || "未命名项目").trim() || "未命名项目";
}

async function defaultProjectSummary() {
  try {
    const info = await stat(path.join(DATA_DIR, "lines.csv"));
    return { id: DEFAULT_PROJECT_ID, name: "虚空城", createdAt: "", updatedAt: info.mtime.toISOString(), storageMode: "http" };
  } catch {
    return { id: DEFAULT_PROJECT_ID, name: "虚空城", createdAt: "", updatedAt: "", storageMode: "http" };
  }
}

/** Lists the default project (data/ itself) followed by any projects under data/projects/. */
async function listProjects() {
  const projects = [await defaultProjectSummary()];
  await mkdir(PROJECTS_ROOT, { recursive: true });
  const entries = await readdir(PROJECTS_ROOT, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const meta = await readFile(path.join(PROJECTS_ROOT, entry.name, "project.json"), "utf8")
      .then((text) => JSON.parse(text))
      .catch(() => null);
    if (!meta || typeof meta.id !== "string") continue;
    projects.push({ id: meta.id, name: safeProjectName(meta.name), createdAt: meta.createdAt || "", updatedAt: meta.updatedAt || "", storageMode: "http" });
  }
  return projects;
}

async function createProject(name) {
  const id = globalThis.crypto?.randomUUID?.()
    ? `project-${globalThis.crypto.randomUUID()}`
    : `project-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const dir = path.join(PROJECTS_ROOT, id);
  await mkdir(path.join(dir, "history"), { recursive: true });
  await mkdir(path.join(dir, "icons"), { recursive: true });
  // User-created projects inherit only display defaults. City content and
  // uploaded resources are intentionally exclusive to the built-in sample.
  await Promise.all([
    ...CSV_FILES.map((fileName) => writeFile(path.join(dir, fileName), EMPTY_PROJECT_CSV[fileName], "utf8")),
    ...["layout.json", LAYOUT_TEMPLATES_FILE].map(async (fileName) => {
      await copyFile(path.join(DATA_DIR, fileName), path.join(dir, fileName)).catch((error) => {
        if (error?.code === "ENOENT") return writeFile(path.join(dir, fileName), fileName === "layout.json" ? "{}" : "", "utf8");
        throw error;
      });
    }),
  ]);
  const timestamp = new Date().toISOString();
  const meta = { id, name: safeProjectName(name), createdAt: timestamp, updatedAt: timestamp };
  await writeFile(path.join(dir, "project.json"), `${JSON.stringify(meta, null, 2)}\n`, "utf8");
  return { ...meta, storageMode: "http" };
}

async function deleteProject(id) {
  if (!id || id === DEFAULT_PROJECT_ID) throw new Error("默认项目不能删除");
  if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error("项目标识无效");
  const dir = path.resolve(PROJECTS_ROOT, id);
  if (!dir.startsWith(path.resolve(PROJECTS_ROOT) + path.sep)) throw new Error("项目路径无效");
  await rm(dir, { recursive: true, force: true });
}

const server = http.createServer(async (request, response) => {
  try {
    if (request.method === "OPTIONS") return sendJson(response, 204, {});
    const url = new URL(request.url || "/", `http://${request.headers.host || "127.0.0.1"}`);
    const projectId = url.searchParams.get("project") || DEFAULT_PROJECT_ID;
    if (request.method === "GET" && url.pathname === "/api/health") {
      return sendJson(response, 200, { ok: true, dataDirectory: DATA_DIR });
    }
    if (request.method === "GET" && url.pathname === "/api/projects") {
      return sendJson(response, 200, await listProjects());
    }
    if (request.method === "POST" && url.pathname === "/api/projects") {
      const { name } = await readJson(request);
      return sendJson(response, 200, await createProject(String(name || "")));
    }
    if (request.method === "DELETE" && url.pathname.startsWith("/api/projects/")) {
      const id = decodeURIComponent(url.pathname.slice("/api/projects/".length));
      await deleteProject(id);
      return sendJson(response, 200, { ok: true });
    }
    if (request.method === "GET" && url.pathname === "/api/data") {
      return sendJson(response, 200, await loadData(projectRoot(projectId)));
    }
    if (request.method === "GET" && url.pathname === "/api/icons") {
      return sendJson(response, 200, await listIcons(projectRoot(projectId)));
    }
    if (request.method === "GET" && url.pathname === "/api/custom-assets") {
      return sendJson(response, 200, await listCustomAssets(projectRoot(projectId)));
    }
    if (request.method === "GET" && url.pathname.startsWith("/api/icons/")) {
      const name = decodeURIComponent(url.pathname.slice("/api/icons/".length));
      try {
        return sendIcon(response, 200, name, await readIcon(name, projectRoot(projectId)));
      } catch (error) {
        if (error?.code === "ENOENT") return sendJson(response, 404, { error: "图标不存在" });
        throw error;
      }
    }
    if (request.method === "DELETE" && url.pathname.startsWith("/api/icons/")) {
      const name = decodeURIComponent(url.pathname.slice("/api/icons/".length));
      await deleteIcon(name, projectRoot(projectId));
      return sendJson(response, 200, { ok: true });
    }
    if (request.method === "POST" && url.pathname === "/api/upload-icon") {
      const body = await readJson(request);
      const filename = await saveIconUpload(String(body.filename || ""), String(body.data || ""), projectRoot(projectId));
      return sendJson(response, 200, { ok: true, filename });
    }
    if (request.method === "POST" && url.pathname === "/api/save") {
      const data = await readJson(request);
      const revision = await saveData(data, projectRoot(projectId));
      return sendJson(response, 200, { ok: true, revision });
    }
    if (request.method === "POST" && url.pathname === "/api/save-layout") {
      const { activeStyleTemplate, layoutTemplates, lineStyleTemplates } = await readJson(request);
      return sendJson(response, 200, { ok: true, ...(await saveLayout(activeStyleTemplate, layoutTemplates, lineStyleTemplates, projectRoot(projectId))) });
    }
    if (request.method === "GET" && url.pathname === "/api/revisions") {
      return sendJson(response, 200, await listRevisions(projectRoot(projectId)));
    }
    if (request.method === "POST" && url.pathname === "/api/restore") {
      const { id } = await readJson(request);
      return sendJson(response, 200, await restoreRevision(String(id || ""), projectRoot(projectId)));
    }
    return sendJson(response, 404, { error: "未找到接口" });
  } catch (error) {
    console.error(error);
    return sendJson(response, 500, { error: error instanceof Error ? error.message : "服务器错误" });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Transit data server: http://127.0.0.1:${PORT}`);
  console.log(`Data directory: ${DATA_DIR}`);
});
