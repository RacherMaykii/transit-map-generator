# 配线图编辑器剩余增强项

最后更新：2026-08-12

## 当前验证基线

- TypeScript：通过
- Production build：通过
- 自动化测试：213/213 通过（`tests/*.test.mjs` 共 12 个文件，`npm test` 先 build 再跑）
- 大对象烟雾测试：20 条线路、300 模块、1000 轨道、1000 标注

设计文档中的最终验收主链路已经实现。以下内容不阻断基础编辑、工程恢复、CSV 更新或导出。

## 非阻断增强

- 把大型 `WiringDiagramApp.tsx` 继续拆成面板、命令和选择控制器；用户已确认保留当前 React 架构。
- 将历史快照实现进一步改为显式 `EditorCommand` 类；当前事务快照已覆盖设计要求中的撤销行为。
- 增加浏览器端 1000 条连接持续拖动的帧率基准；当前鼠标移动已用 `requestAnimationFrame` 合并，纯排序烟雾测试已覆盖 2300 个对象。

## 已知环境提示

测试并行创建 Vite 中间件时，可能打印 `Port 24678 is already in use` 的 WebSocket 提示；测试、构建和产物不受影响。

配线图目标文件的 ESLint 为 0 错误。全仓库 ESLint 当前 41 错误、1693 告警；其中告警绝大多数来自一个 vendor 打包文件（单行 2:XXXX 批量 `no-unused-expressions`），错误分布于项目门户、出入口标识、线路图、历史栈、生成类型文件和各 `.test.mjs` 的 `module` 变量赋值（@next/next/no-assign-module-variable）。不属于本轮配线图验收范围。
