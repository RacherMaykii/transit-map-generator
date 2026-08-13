// Vite 静态构建注入的构建期环境变量类型。
// 只声明本项目实际用到的一个变量，避免引入整套 vite/client 类型与 Next 的图片类型声明冲突。
interface ImportMeta {
  readonly env: {
    readonly VITE_CLOUDFLARE_ANALYTICS_TOKEN?: string;
  };
}
