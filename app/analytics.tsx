// 静态托管访问统计：Cloudflare Web Analytics（免费、无 Cookie、隐私友好）。
// 仅用于静态构建（static-dist）。未配置 VITE_CLOUDFLARE_ANALYTICS_TOKEN 时本组件不渲染任何内容，
// 构建产物零痕迹；配置后注入 Cloudflare 官方 beacon 脚本。
// 令牌在 Cloudflare 控制台 → Analytics & Logs → Web Analytics → 添加站点后获得；
// 它不属于密钥（会公开出现在页面源码中），GitHub Pages 等静态托管均可使用。

export function AnalyticsBeacon() {
  const token = import.meta.env.VITE_CLOUDFLARE_ANALYTICS_TOKEN;
  if (!token) return null;
  return (
    <script
      defer
      src="https://static.cloudflareinsights.com/beacon.min.js"
      data-cf-beacon={JSON.stringify({ token })}
    />
  );
}
