// 站点部署根路径：支持部署在任意子路径（如 GitHub Pages 的 /仓库名/）。
// 浏览器里基于 document.baseURI 计算当前部署子路径；SSR/Node 无 document 时退回根路径 "/"。
// 与 vite.static.config.ts 的 base: "./" 配合：HTML/CSS 引用由 vite 转成相对路径，
// 这里处理 JS/JSX 里动态拼接的资源与 fetch 路径。

export function siteBase(): string {
  if (typeof document !== "undefined") {
    const dir = new URL(".", document.baseURI).pathname;
    return dir.endsWith("/") ? dir : `${dir}/`;
  }
  return "/";
}

/** 把 public 目录下的资源路径换算为当前部署根路径下的完整路径 */
export function siteUrl(path: string): string {
  return siteBase() + path.replace(/^\/+/, "");
}
