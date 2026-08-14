// 静态托管访问统计：Cloudflare Web Analytics（免费、无 Cookie、隐私友好）。
// 仅用于静态构建（static-dist）。项目自带 GitHub Pages 站点令牌，
// 也允许通过 VITE_CLOUDFLARE_ANALYTICS_TOKEN 覆盖，方便分叉项目使用自己的统计站点。
// 令牌在 Cloudflare 控制台 → Analytics & Logs → Web Analytics → 添加站点后获得；
// 它不属于密钥（会公开出现在页面源码中），GitHub Pages 等静态托管均可使用。

const DEFAULT_CLOUDFLARE_ANALYTICS_TOKEN = "ae18141ca60a4a27997d54a2f03f937d";

export function AnalyticsBeacon() {
  const token = import.meta.env.VITE_CLOUDFLARE_ANALYTICS_TOKEN?.trim()
    || DEFAULT_CLOUDFLARE_ANALYTICS_TOKEN;
  return (
    <script
      type="module"
      src="https://static.cloudflareinsights.com/beacon.min.js"
      data-cf-beacon={JSON.stringify({ token })}
    />
  );
}
