// 浏览器端通用工具。此前 transit/entrance/wiring.projectStore 各自维护一份相同的
// downloadBlob，现已收敛于此单一定义（wiring 经 projectStore re-export 保持调用点不变）。

/** 触发浏览器下载一个 Blob，1 秒后释放对象 URL。 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
