import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { strFromU8, unzipSync } from "fflate";

const archivePath = process.argv[2];
if (!archivePath) {
  throw new Error("用法：node scripts/update-default-wiring-sample.mjs <虚空城.railcity>");
}

const entries = unzipSync(new Uint8Array(await readFile(resolve(archivePath))));
const manifestBytes = entries["manifest.json"];
if (!manifestBytes) throw new Error("工程包缺少 manifest.json");

const manifest = JSON.parse(strFromU8(manifestBytes));
if (manifest.kind !== "railcity-project" || manifest.mode !== "full") {
  throw new Error("默认示例必须来自完整 .railcity 工程包");
}

const wiringPath = manifest.wiringProjectPath || manifest.editors?.wiring;
const wiringBytes = wiringPath ? entries[wiringPath] : undefined;
if (!wiringBytes) throw new Error("工程包缺少配线图工程内容");

const project = JSON.parse(strFromU8(wiringBytes));
if (!Array.isArray(project.modules) || !Array.isArray(project.connections)) {
  throw new Error("配线图工程结构无效");
}

// 默认示例从当前项目 CSV 读取站点数据，避免把导出时的源数据快照长期固化。
delete project.sourceDataSnapshot;

const outputPath = resolve("public/sample-projects/default/wiring.json");
await writeFile(outputPath, `${JSON.stringify(project, null, 2)}\n`, "utf8");
console.log(`默认虚空城配线图已更新：${project.modules.length} 个元件，${project.connections.length} 条连线`);
