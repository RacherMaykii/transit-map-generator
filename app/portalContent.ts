// 门户「关于」与「注意事项/免责声明」弹窗内容。
// 链接与文案集中于此，便于日后修改。版本号自动跟随 package.json。

import pkg from "../package.json";

export const APP_VERSION = pkg.version;

export interface AboutLink {
  label: string;
  sublabel: string;
  /** 外链地址；缺省时渲染为「搜索引导」信息卡片（无外链） */
  url?: string;
}

/** 「关于」弹窗里的外部链接与项目入口 */
export const ABOUT_LINKS: AboutLink[] = [
  { label: "哔哩哔哩", sublabel: "Bilibili 个人空间", url: "https://space.bilibili.com/14029842" },
  { label: "抖音", sublabel: "Douyin 主页", url: "https://v.douyin.com/ZAkiWV5IbdM" },
  { label: "QQ 频道", sublabel: "加入 QQ 频道", url: "https://pd.qq.com/s/c17qqsm1s" },
  { label: "我的世界 · 虚空城", sublabel: "在《我的世界》中国版搜索「虚空小组」或「虚空城」" },
];

/** 「关于」弹窗顶部免费声明 */
export const FREE_NOTE = "本软件完全免费、无广告、无内购。如有人向你收费，请立即退款并举报。";

/** 门户顶部 Beta 提示条文案 */
export const BETA_NOTICE = "本软件目前为 Beta 版本，可能存在兼容性问题。";

/** 「查看详情」弹窗内容 */
export const BETA_DETAILS: { title: string; body: string }[] = [
  {
    title: "如何反馈问题",
    body: "软件仍在开发中，难免存在 bug。遇到问题或建议，可通过「关于」弹窗中的哔哩哔哩、抖音或 QQ 频道联系作者，反馈时请附上版本号与操作步骤。",
  },
  {
    title: "已知问题",
    body: "当前版本可能存在未修复的 bug 或异常表现。重要操作前建议先导出 .railcity 备份；如遇异常，可重新导入备份恢复。",
  },
  {
    title: "工程兼容性",
    body: "新版本可能调整工程文件格式或数据结构，早期版本导出的 .railcity / .railproj 备份不一定能在新版本中正常打开。请保留旧版本或旧备份，以便日后读取。",
  },
];

/** 注意事项 */
export const NOTES: string[] = [
  "项目数据默认保存在当前浏览器（或本地 data 目录），请定期在门户点击「导出项目」生成 .railcity 备份。",
  "换浏览器或设备前，先导出 .railcity 备份，再在目标设备「导入项目」恢复。",
  "上传的图标、背景图等素材请确认使用授权；内置示例素材仅用于演示。",
  "生成的站序图、配线图等用于游戏内规划参考，请以实际游戏内容为准。",
];

/** 免责声明 */
export const DISCLAIMER_SECTIONS: { title: string; body: string }[] = [
  {
    title: "免费与责任",
    body: "本软件完全免费，按“现状”提供，不提供任何明示或默示的担保。因使用或无法使用本软件产生的任何损失，作者概不负责。",
  },
  {
    title: "内容与素材",
    body: "软件内的站名、线路、图片等素材仅用于《我的世界》等游戏内的轨道交通规划与展示，与现实交通系统无任何关联；若涉及现实名称或商标，权利归其原作者所有，仅供学习参考。",
  },
  {
    title: "数据安全",
    body: "请定期导出 .railcity 备份。清除浏览器数据或误操作可能导致项目数据丢失，请自行做好备份。",
  },
];
