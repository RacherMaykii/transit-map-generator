import type { Metadata } from "next";
import ProjectPortal from "./ProjectPortal";

export const metadata: Metadata = {
  title: "轨道交通视觉设计工坊",
  description: "管理线路站序图、出入口站名标识与配线图项目，生成虚空城轨道交通地图画图片",
};

export default function Home() {
  return <ProjectPortal />;
}
