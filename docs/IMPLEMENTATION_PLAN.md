# 配线图编辑器实施状态

最后更新：2026-08-07

## 架构决定

项目继续使用 React 19、TypeScript、Vinext/Vite、SVG 与 IndexedDB。原设计中的 domain、store 和 service 职责由 React 状态与 `app/wiring`、`app/transit` 下的纯逻辑模块承担；不再强制迁移 Vue/Pinia。

## 阶段状态

### 1. 项目骨架与画布：完成

- 三栏专业工具界面、SVG 世界坐标、平移缩放和多画布。
- 自定义尺寸、方向、背景色、网格以及适应/居中/原始尺寸。

### 2. 基础图形编辑：完成

- 选择、拖动、删除、锁定、zIndex、树形图层和统一跨类型渲染顺序。
- 背景导入、替换、旋转、缩放、居中和大图编辑预览。
- 标签、图标与站台均可独立编辑；附着对象保持相对偏移。
- 撤销/重做、100 步历史和 IndexedDB 防抖自动保存。

### 3. 模板、端口与轨道：完成

- 22 个模板、连续放置、端口兼容、吸附和上下行双线自动连接。
- 移动模块后连接跟随；支持控制点、曲线、断开和桥接交叉样式。

### 4. CSV 与源身份：完成

- `lines.csv`、`stations.csv`、`transfers.csv` 直接导入、预览和字段级校验。
- BOM、引号字段、空值转换、重复 ID、未知线路和文件/行/字段诊断。
- 稳定 `SourceLine` / `SourceStationOnLine` 身份，以及显式确认的 `PhysicalStation` 映射。
- 站点拖放、默认模板放置和插入前后相邻模块之间。

### 5. 换乘、运行关系与筛选：完成

- 十字、双岛、西班牙式、叠岛和出站换乘；出站步行通道支持多成员。
- R1 使用 `ServicePattern` 映射 L7/L9，不生成重复物理轨道。
- 线路、交路、状态、对象类型、换乘类型、变更状态和图层组合筛选。
- 仅目标、保留换乘提示、淡化其它三种模式与中/英/双语站名模式。

### 6. 工程文件：完成

- schema v2 `.metroproj` ZIP、纯函数 v1 -> v2 迁移和未来版本拒绝。
- 工程 JSON、标准化源 CSV、背景、图标和 `thumbnails/preview.png`。
- 旧工程源身份重建、资源恢复、大小/条目限制和缺失资源诊断。

### 7. CSV 增量更新：完成

- 结构化字段 diff、严重程度、状态、对象指纹和待放置托盘。
- 信息项批量接受、旧值/新值、定位、接受/忽略、删除源标记和重新绑定。
- 名称、线路、英文名和已导入图标自动更新，同时保留图面布局。

### 8. 导出与验证：完成

- 干净 SVG、PNG 1x/2x/4x、透明/当前背景、选区/全画布和参考图开关。
- 类型检查、production build 和 36 个自动化测试通过。
- 20 条线路、300 模块、1000 轨道和 1000 标注的排序烟雾测试已加入。

## 关键模块

```text
app/wiring/WiringDiagramApp.tsx  编辑器 UI 与交互编排
app/wiring/types.ts              图面和源身份领域类型
app/wiring/history.ts            历史快照与撤销/重做
app/wiring/projectStore.ts       schema、ZIP 与 IndexedDB
app/wiring/connectionLogic.ts    端口、双线连接与轨道同步
app/wiring/filtering.ts          组合筛选
app/wiring/sourceIdentity.ts     源身份和物理站映射
app/wiring/assetImport.ts        图标 ZIP/目录导入
app/transit/csv-io.ts            CSV 解析和校验
app/transit/sourceChanges.ts     增量变更
```

非阻断增强见 `docs/REMAINING_WORK.md`。
