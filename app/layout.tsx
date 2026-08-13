import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "轨道交通视觉设计工坊",
  description: "线路站序图、出入口站名标识与线路信息图的本地制作空间",
  icons: { icon: "/assets/rail-transit-icon.png" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
