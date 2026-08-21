// ──────────────────────────────────────────────
// 配线图编辑器 · 动态模板工厂
// 从 templates.ts 拆出（makeCustomizedTemplate），逐字保留原实现。
// ──────────────────────────────────────────────

import { DOWN_MAIN_Y, UP_MAIN_Y, type ModulePort, type ModuleTemplate, type TemplateLabel, type TemplatePlatform, type TemplateTrack } from "../types";

// ── 动态模板工厂 ──────────────────────────────

export type DoubleForkKind = "up" | "dn" | "y";

/** 旧工程的角度参数换算为同等纵向开口幅度。 */
export function legacyForkAngleToOpening(angle: number, length: number): number {
  if (!Number.isFinite(angle) || !Number.isFinite(length) || length <= 0) return 0;
  return Math.max(0, Math.round((length / 2) * Math.tan((angle * Math.PI) / 180)));
}

interface ParallelForkPair {
  upperTrack: TemplateTrack;
  lowerTrack: TemplateTrack;
  upperPort: { x: number; y: number; direction: number };
  lowerPort: { x: number; y: number; direction: number };
}

/**
 * 构造一对保持真实间距的斜向双线。
 *
 * 过去两条斜轨共用同一个分叉 x，并在终点保持竖直间距 spacing；斜率越大，
 * 两轨的法向距离会缩成 spacing*cos(angle)，视觉上像线路宽度被压窄。这里先
 * 生成支线中心线，再沿法向各偏移 spacing/2。两条轨道因此始终平行且法向距离
 * 恒为 spacing；它们与原水平正线的交点自然成为两个不同的动态分叉点。
 */
function buildParallelForkPair(
  width: number,
  divX: number,
  inUp: number,
  inDn: number,
  signedOpening: number,
  spacing: number,
  alignEnds: boolean,
): ParallelForkPair {
  const centerY = (inUp + inDn) / 2;
  const halfSpacing = spacing / 2;

  // 对齐模式按画布纵向线距排布整对支线：两轨共用分叉 X 与输出 X，
  // 起点、终点的垂直距离都严格等于 spacing。该模式允许整对支线移动，
  // 避免用末端折线补齐后造成出口间距大于设置值。
  if (alignEnds) {
    const upperEnd = { x: width, y: centerY + signedOpening - halfSpacing };
    const lowerEnd = { x: width, y: centerY + signedOpening + halfSpacing };
    const direction = (Math.round(Math.atan2(signedOpening, width - divX) * 180 / Math.PI) % 360 + 360) % 360;
    return {
      upperTrack: { x1: divX, y1: inUp, x2: upperEnd.x, y2: upperEnd.y, type: "branch" },
      lowerTrack: { x1: divX, y1: inDn, x2: lowerEnd.x, y2: lowerEnd.y, type: "branch" },
      upperPort: { ...upperEnd, direction },
      lowerPort: { ...lowerEnd, direction },
    };
  }

  // 右端口沿斜线法向错开。迭代收回中心线终点，保证最外侧端口不超过 width。
  let centerEndX = width;
  for (let index = 0; index < 6; index += 1) {
    const dx = Math.max(1, centerEndX - divX);
    const length = Math.hypot(dx, signedOpening);
    const normalX = -signedOpening / length;
    centerEndX = width - Math.abs(normalX) * halfSpacing;
  }

  const dx = Math.max(1, centerEndX - divX);
  const length = Math.hypot(dx, signedOpening);
  const tangentX = dx / length;
  const tangentY = signedOpening / length;
  const normalX = -tangentY;
  const normalY = tangentX;
  const upperLinePoint = { x: divX - normalX * halfSpacing, y: centerY - normalY * halfSpacing };
  const lowerLinePoint = { x: divX + normalX * halfSpacing, y: centerY + normalY * halfSpacing };
  const branchXAtY = (linePoint: { x: number; y: number }, targetY: number) => {
    if (Math.abs(tangentY) < 1e-6) return divX;
    return linePoint.x + ((targetY - linePoint.y) * tangentX) / tangentY;
  };
  const upperStartX = branchXAtY(upperLinePoint, inUp);
  const lowerStartX = branchXAtY(lowerLinePoint, inDn);
  const naturalUpperEnd = { x: centerEndX - normalX * halfSpacing, y: centerY + signedOpening - normalY * halfSpacing };
  const naturalLowerEnd = { x: centerEndX + normalX * halfSpacing, y: centerY + signedOpening + normalY * halfSpacing };
  const direction = (Math.round(Math.atan2(tangentY, tangentX) * 180 / Math.PI) % 360 + 360) % 360;

  return {
    upperTrack: { x1: upperStartX, y1: inUp, x2: naturalUpperEnd.x, y2: naturalUpperEnd.y, type: "branch" },
    lowerTrack: { x1: lowerStartX, y1: inDn, x2: naturalLowerEnd.x, y2: naturalLowerEnd.y, type: "branch" },
    upperPort: { ...naturalUpperEnd, direction },
    lowerPort: { ...naturalLowerEnd, direction },
  };
}

/** 双线分叉的单一几何入口，静态模板与参数化模板共用。 */
export function buildDoubleForkGeometry(
  forkKind: DoubleForkKind,
  width: number,
  spacing: number,
  requestedOpening: number,
  alignEnds = false,
): Pick<ModuleTemplate, "width" | "height" | "ports" | "tracks" | "labels"> {
  const opening = Math.max(requestedOpening, forkKind === "y" ? spacing / 2 : spacing);
  const inUp = forkKind === "y" ? 12 + spacing : forkKind === "up" ? 12 + spacing + 24 : 56 - spacing / 2;
  const inDn = inUp + spacing;
  const divX = Math.round(width / 2);
  const upperPair = forkKind === "up" || forkKind === "y"
    ? buildParallelForkPair(width, divX, inUp, inDn, -opening, spacing, alignEnds)
    : null;
  const lowerPair = forkKind === "dn" || forkKind === "y"
    ? buildParallelForkPair(width, divX, inUp, inDn, opening, spacing, alignEnds)
    : null;

  let ports: ModulePort[];
  let tracks: TemplateTrack[];
  let labels: TemplateLabel[];
  if (forkKind === "y") {
    const upper = upperPair!;
    const lower = lowerPair!;
    const mainEndX = Math.max(upper.upperTrack.x1, upper.lowerTrack.x1, lower.upperTrack.x1, lower.lowerTrack.x1);
    ports = [
      { id: "L_up1", name: "左·上行", side: "left", role: "up_main", x: 0, y: inUp, direction: 180 },
      { id: "L_dn1", name: "左·下行", side: "left", role: "down_main", x: 0, y: inDn, direction: 180 },
      { id: "R_up1", name: "右·上支上行", side: "right", role: "up_main", ...upper.upperPort },
      { id: "R_dn1", name: "右·上支下行", side: "right", role: "down_main", ...upper.lowerPort },
      { id: "R_up2", name: "右·下支上行", side: "right", role: "up_main", ...lower.upperPort },
      { id: "R_dn2", name: "右·下支下行", side: "right", role: "down_main", ...lower.lowerPort },
    ];
    tracks = [
      { x1: 0, y1: inUp, x2: mainEndX, y2: inUp, type: "main" },
      { x1: 0, y1: inDn, x2: mainEndX, y2: inDn, type: "main" },
      upper.upperTrack,
      upper.lowerTrack,
      lower.upperTrack,
      lower.lowerTrack,
    ];
    labels = [{ x: 40, y: 36, text: "Y形分叉", fontSize: 9, anchor: "middle", fill: "#6b7b85" }];
  } else {
    const pair = (forkKind === "up" ? upperPair : lowerPair)!;
    ports = [
      { id: "L_up1", name: "左·上行", side: "left", role: "up_main", x: 0, y: inUp, direction: 180 },
      { id: "L_dn1", name: "左·下行", side: "left", role: "down_main", x: 0, y: inDn, direction: 180 },
      { id: "R_up1", name: "右·直股上行", side: "right", role: "up_main", x: width, y: inUp, direction: 0 },
      { id: "R_dn1", name: "右·直股下行", side: "right", role: "down_main", x: width, y: inDn, direction: 0 },
      { id: "R_up2", name: "右·支线上行", side: "right", role: "up_main", ...pair.upperPort },
      { id: "R_dn2", name: "右·支线下行", side: "right", role: "down_main", ...pair.lowerPort },
    ];
    tracks = [
      { x1: 0, y1: inUp, x2: width, y2: inUp, type: "main" },
      { x1: 0, y1: inDn, x2: width, y2: inDn, type: "main" },
      pair.upperTrack,
      pair.lowerTrack,
    ];
    labels = [forkKind === "up"
      ? { x: 40, y: 30, text: "上分叉", fontSize: 9, anchor: "middle", fill: "#6b7b85" }
      : { x: 40, y: 26, text: "下分叉", fontSize: 9, anchor: "middle", fill: "#6b7b85" }];
  }

  const ys = [...tracks.flatMap((track) => [track.y1, track.y2]), ...ports.map((port) => port.y)];
  const minHeight = forkKind === "up" ? 128 : 144;
  return { width, height: Math.max(minHeight, Math.max(...ys) + 12), ports, tracks, labels };
}

/**
 * 根据自定义参数生成模板变体。
 * 用于道岔等可调参数的模板 —— 根据 length、branchOffset、spacing 等
 * 重新计算 tracks、ports、labels 坐标。
 */
export function makeCustomizedTemplate(
  base: ModuleTemplate,
  customParams: Record<string, number>,
): ModuleTemplate {
  const p = (key: string) => customParams[key] ?? base.params?.find(pp => pp.key === key)?.default ?? 0;
  const hasLength = base.params?.some(pp => pp.key === "length");
  const hasSpacing = base.params?.some(pp => pp.key === "spacing");
  const hasBranchOffset = base.params?.some(pp => pp.key === "branchOffset");
  const hasPlatformLength = base.params?.some(pp => pp.key === "platformLength");
  const hasPlatformWidth = base.params?.some(pp => pp.key === "platformWidth");

  const length = hasLength ? p("length") : base.width;
  const spacing = hasSpacing ? p("spacing") : (DOWN_MAIN_Y - UP_MAIN_Y);
  const legacyAngle = customParams.angle;
  const branchOffset = hasBranchOffset
    ? customParams.branchOffset ?? (Number.isFinite(legacyAngle) ? legacyForkAngleToOpening(legacyAngle, length) : p("branchOffset"))
    : 24;
  const alignBranchEnds = customParams.alignBranchEnds === 1;
  const platformLength = hasPlatformLength ? p("platformLength") : (base.platforms[0]?.width ?? 0);
  const platformWidth = hasPlatformWidth ? p("platformWidth") : (base.platforms[0]?.height ?? 0);
  const upY = 56 - spacing / 2;
  const downY = 56 + spacing / 2;
  const centerY = 56;

  let ports: ModulePort[];
  let tracks: TemplateTrack[];
  let labels: TemplateLabel[];
  let platforms: TemplatePlatform[] = base.platforms;
  let width: number;
  let height: number;
  // 分叉：开口幅度只移动支线端口，直股/输入固定。为保持输入位置不变，分叉的几何
  // 自适应不做整体下移（除非内容顶出模板上沿），只按支线实际纵向范围扩高。
  let isFork = false;

  if (base.id === "double_island") {
    const islandGap = p("islandGap");
    const trackYs = [20, 60, 36 + islandGap, 76 + islandGap];
    const platformYs = [32, 48 + islandGap];
    return {
      ...base,
      width: 200,
      height: 96 + islandGap,
      ports: base.ports.map((port, index) => ({ ...port, y: trackYs[index % 4] })),
      tracks: trackYs.map((y) => ({ x1: 0, y1: y, x2: 200, y2: y, type: "main" as const })),
      platforms: base.platforms.map((platform, index) => ({ ...platform, y: platformYs[index] })),
      labels: base.labels.map((label, index) => index === 1 ? { ...label, y: 88 + islandGap } : label),
    };
  }

  switch (base.id) {
    // ── 双线区间 / 侧式 / 岛式 / 西班牙式：线路间距 —— 上下行围绕中线对称展开，站台与站名跟随 ──
    case "double_track":
    case "side_platform":
    case "island_platform":
    case "spanish_platform": {
      width = base.width;
      height = spacing + 72;
      const upY = 56 - spacing / 2;
      const downY = 56 + spacing / 2;
      const shiftedY = (y: number) => y === UP_MAIN_Y ? upY : y === DOWN_MAIN_Y ? downY : y;
      ports = base.ports.map((port) => ({ ...port, y: shiftedY(port.y) }));
      tracks = base.tracks.map((track) => ({ ...track, y1: shiftedY(track.y1), y2: shiftedY(track.y2) }));
      if (base.id === "island_platform") {
        // 岛式站台保持居中；中文名贴在上行轨上方、英文名贴在下行轨下方
        platforms = base.platforms.map((platform) => ({ ...platform, y: 48 }));
        labels = base.labels.map((label, index) => index === 0 ? { ...label, y: upY - 6 } : { ...label, y: downY + 24 });
      } else if (base.id === "spanish_platform") {
        // 上侧式 = 上行轨上方，岛式居中，下侧式 = 下行轨下方
        platforms = base.platforms.map((platform, index) => ({ ...platform, y: [upY - 20, 48, downY + 4][index] }));
        labels = base.labels.map((label, index) => index === 0 ? { ...label, y: upY - 22 } : { ...label, y: downY + 29 });
      } else if (base.id === "side_platform") {
        platforms = base.platforms.map((platform, index) => ({ ...platform, y: index === 0 ? upY - 20 : downY + 4 }));
        labels = base.labels.map((label, index) => index === 0 ? { ...label, y: upY - 22 } : { ...label, y: downY + 29 });
      } else {
        labels = base.labels;
      }
      // 站台长度/宽度可调：平台水平居中，宽度=platformLength、厚度=platformWidth（默认值下与原几何一致）。
      // 双线区间等无站台模板的 platforms 为空数组，此处为无操作。
      platforms = platforms.map((platform) => ({
        ...platform,
        x: (width - platformLength) / 2,
        width: platformLength,
        height: platformWidth,
      }));
      break;
    }
    // ── 同台换乘：线路间距 = 两座岛式站台之间的间距（上组固定，下组随间距下移）──
    case "cross_platform": {
      width = base.width;
      height = 96 + spacing;
      const trackYs = [20, 60, 36 + spacing, 76 + spacing];
      ports = base.ports.map((port, index) => ({ ...port, y: trackYs[index % 4] }));
      tracks = base.tracks.map((track, index) => ({ ...track, y1: trackYs[index], y2: trackYs[index] }));
      platforms = base.platforms.map((platform, index) => ({ ...platform, y: index === 0 ? 32 : 48 + spacing }));
      labels = base.labels.map((label, index) => index === 0 ? { ...label, y: 14 } : { ...label, y: 88 + spacing });
      break;
    }
    case "pre_turnback":
    case "post_turnback": {
      const beforePlatform = base.id === "pre_turnback";
      width = platformLength + 120;
      height = 112;
      const platformX = beforePlatform ? 100 : 20;
      const crossoverStart = beforePlatform ? 15 : width - 90;
      const crossoverEnd = beforePlatform ? 90 : width - 15;
      const platformY = centerY - platformWidth / 2;
      ports = [
        { id: "L_up", name: "左·上行", side: "left", role: "up_main", x: 0, y: upY, direction: 180 },
        { id: "L_dn", name: "左·下行", side: "left", role: "down_main", x: 0, y: downY, direction: 180 },
        { id: "R_up", name: "右·上行", side: "right", role: "up_main", x: width, y: upY, direction: 0 },
        { id: "R_dn", name: "右·下行", side: "right", role: "down_main", x: width, y: downY, direction: 0 },
      ];
      tracks = [
        { x1: 0, y1: upY, x2: width, y2: upY, type: "main" },
        { x1: 0, y1: downY, x2: width, y2: downY, type: "main" },
        { x1: crossoverStart, y1: upY, x2: crossoverEnd, y2: downY, type: "turnback" },
        { x1: crossoverStart, y1: downY, x2: crossoverEnd, y2: upY, type: "turnback" },
      ];
      platforms = [{ x: platformX, y: platformY, width: platformLength, height: platformWidth, type: "island", label: "折返站台" }];
      labels = [
        { x: platformX + platformLength / 2, y: platformY - 8, text: "折返站", fontSize: 13, anchor: "middle", fill: "#202124" },
        beforePlatform
          ? { x: 15, y: 100, text: "← 折返", fontSize: 9, anchor: "middle", fill: "#6b7b85" }
          : { x: width - 25, y: 100, text: "折返 →", fontSize: 9, anchor: "middle", fill: "#6b7b85" },
      ];
      break;
    }
    // ── 双岛四线站 ────────────────────────────
    case "double_island": {
      const islandGap = p("islandGap");
      width = 200;
      height = 88 + islandGap;
      // 两个岛式站台，各自正线距站台 8px；两岛之间间距 = islandGap
      const inner2Y = 36 + islandGap;
      const outerDownY = 68 + islandGap;
      const island2Y = 44 + islandGap;
      ports = [
        { id: "L_up1", name: "左·上行", side: "left", role: "up_main", x: 0, y: 20, direction: 180 },
        { id: "L_dn1", name: "左·下行", side: "left", role: "down_main", x: 0, y: 52, direction: 180 },
        { id: "L_up2", name: "左·上行2", side: "left", role: "up_main", x: 0, y: inner2Y, direction: 180 },
        { id: "L_dn2", name: "左·下行2", side: "left", role: "down_main", x: 0, y: outerDownY, direction: 180 },
        { id: "R_up1", name: "右·上行", side: "right", role: "up_main", x: width, y: 20, direction: 0 },
        { id: "R_dn1", name: "右·下行", side: "right", role: "down_main", x: width, y: 52, direction: 0 },
        { id: "R_up2", name: "右·上行2", side: "right", role: "up_main", x: width, y: inner2Y, direction: 0 },
        { id: "R_dn2", name: "右·下行2", side: "right", role: "down_main", x: width, y: outerDownY, direction: 0 },
      ];
      tracks = [
        { x1: 0, y1: 20, x2: width, y2: 20, type: "main" },
        { x1: 0, y1: 52, x2: width, y2: 52, type: "main" },
        { x1: 0, y1: inner2Y, x2: width, y2: inner2Y, type: "main" },
        { x1: 0, y1: outerDownY, x2: width, y2: outerDownY, type: "main" },
      ];
      platforms = [
        { x: 10, y: 28, width: width - 20, height: 16, type: "island", label: "岛式站台" },
        { x: 10, y: island2Y, width: width - 20, height: 16, type: "island", label: "岛式站台" },
      ];
      labels = [
        { x: width / 2, y: 14, text: "站名", fontSize: 13, anchor: "middle", fill: "#202124" },
        { x: width / 2, y: 80 + islandGap, text: "Station", fontSize: 9, anchor: "middle", fill: "#6b7b85" },
      ];
      break;
    }
    // ── 左开 / 右开道岔 ──────────────────────
    case "left_turnout": {
      width = length;
      height = 80;
      const branchY = centerY - branchOffset;
      ports = [
        { id: "L_main", name: "左·正线", side: "left", role: "up_main", x: 0, y: centerY, direction: 180 },
        { id: "R_main", name: "右·直股", side: "right", role: "up_main", x: width, y: centerY, direction: 0 },
        { id: "R_branch", name: "右·侧股", side: "right", role: "branch", x: width, y: branchY, direction: 0 },
      ];
      const divX1 = width * 0.5;
      tracks = [
        { x1: 0, y1: centerY, x2: width, y2: centerY, type: "main" },
        { x1: divX1, y1: centerY, x2: width, y2: branchY, type: "branch" },
      ];
      labels = [{ x: width / 2, y: centerY + 20, text: "左开", fontSize: 9, anchor: "middle", fill: "#6b7b85" }];
      break;
    }
    case "right_turnout": {
      width = length;
      height = 80;
      const branchY = centerY + branchOffset;
      ports = [
        { id: "L_main", name: "左·正线", side: "left", role: "up_main", x: 0, y: centerY, direction: 180 },
        { id: "R_main", name: "右·直股", side: "right", role: "up_main", x: width, y: centerY, direction: 0 },
        { id: "R_branch", name: "右·侧股", side: "right", role: "branch", x: width, y: branchY, direction: 0 },
      ];
      const divX2 = width * 0.5;
      tracks = [
        { x1: 0, y1: centerY, x2: width, y2: centerY, type: "main" },
        { x1: divX2, y1: centerY, x2: width, y2: branchY, type: "branch" },
      ];
      labels = [{ x: width / 2, y: centerY - 20, text: "右开", fontSize: 9, anchor: "middle", fill: "#6b7b85" }];
      break;
    }
    // ── 单渡线 ───────────────────────────────
    case "single_crossover": {
      width = length;
      height = 112;
      ports = [
        { id: "L_up", name: "左·上行", side: "left", role: "up_main", x: 0, y: upY, direction: 180 },
        { id: "L_dn", name: "左·下行", side: "left", role: "down_main", x: 0, y: downY, direction: 180 },
        { id: "R_up", name: "右·上行", side: "right", role: "up_main", x: width, y: upY, direction: 0 },
        { id: "R_dn", name: "右·下行", side: "right", role: "down_main", x: width, y: downY, direction: 0 },
      ];
      const x1 = width * 0.3;
      const x2 = width * 0.7;
      tracks = [
        { x1: 0, y1: upY, x2: width, y2: upY, type: "main" },
        { x1: 0, y1: downY, x2: width, y2: downY, type: "main" },
        { x1: x1, y1: upY, x2: x2, y2: downY, type: "branch" },
      ];
      labels = [{ x: width / 2, y: downY + 28, text: "单渡线", fontSize: 9, anchor: "middle", fill: "#6b7b85" }];
      break;
    }
    // ── 交叉渡线 ─────────────────────────────
    case "double_crossover": {
      width = length;
      height = 112;
      ports = [
        { id: "L_up", name: "左·上行", side: "left", role: "up_main", x: 0, y: upY, direction: 180 },
        { id: "L_dn", name: "左·下行", side: "left", role: "down_main", x: 0, y: downY, direction: 180 },
        { id: "R_up", name: "右·上行", side: "right", role: "up_main", x: width, y: upY, direction: 0 },
        { id: "R_dn", name: "右·下行", side: "right", role: "down_main", x: width, y: downY, direction: 0 },
      ];
      const a1 = width * 0.17;
      const a2 = width * 0.83;
      tracks = [
        { x1: 0, y1: upY, x2: width, y2: upY, type: "main" },
        { x1: 0, y1: downY, x2: width, y2: downY, type: "main" },
        { x1: a1, y1: upY, x2: a2, y2: downY, type: "branch" },
        { x1: a1, y1: downY, x2: a2, y2: upY, type: "branch" },
      ];
      labels = [{ x: width / 2, y: downY + 28, text: "交叉渡线", fontSize: 9, anchor: "middle", fill: "#6b7b85" }];
      break;
    }
    // ── 剪式渡线 ─────────────────────────────
    case "scissors_crossover": {
      width = length;
      height = 112;
      ports = [
        { id: "L_up", name: "左·上行", side: "left", role: "up_main", x: 0, y: upY, direction: 180 },
        { id: "L_dn", name: "左·下行", side: "left", role: "down_main", x: 0, y: downY, direction: 180 },
        { id: "R_up", name: "右·上行", side: "right", role: "up_main", x: width, y: upY, direction: 0 },
        { id: "R_dn", name: "右·下行", side: "right", role: "down_main", x: width, y: downY, direction: 0 },
      ];
      const s1 = width * 0.14;
      const s2 = width * 0.5;
      const s3 = width * 0.86;
      tracks = [
        { x1: 0, y1: upY, x2: width, y2: upY, type: "main" },
        { x1: 0, y1: downY, x2: width, y2: downY, type: "main" },
        { x1: s1, y1: upY, x2: s2, y2: downY, type: "branch" },
        { x1: s2, y1: upY, x2: s3, y2: downY, type: "branch" },
        { x1: s1, y1: downY, x2: s2, y2: upY, type: "branch" },
        { x1: s2, y1: downY, x2: s3, y2: upY, type: "branch" },
      ];
      labels = [{ x: width / 2, y: downY + 28, text: "剪式渡线", fontSize: 9, anchor: "middle", fill: "#6b7b85" }];
      break;
    }
    // ── 支线分岔 ─────────────────────────────
    case "branch_diverge": {
      width = length;
      height = 112;
      const branchY = downY + branchOffset;
      ports = [
        { id: "L_up", name: "左·上行", side: "left", role: "up_main", x: 0, y: upY, direction: 180 },
        { id: "L_dn", name: "左·下行", side: "left", role: "down_main", x: 0, y: downY, direction: 180 },
        { id: "R_up", name: "右·上行", side: "right", role: "up_main", x: width, y: upY, direction: 0 },
        { id: "R_dn", name: "右·下行", side: "right", role: "down_main", x: width, y: downY, direction: 0 },
        { id: "R_branch", name: "右·支线", side: "right", role: "branch", x: width, y: branchY, direction: 0 },
      ];
      const divB = width * 0.5;
      tracks = [
        { x1: 0, y1: upY, x2: width, y2: upY, type: "main" },
        { x1: 0, y1: downY, x2: width, y2: downY, type: "main" },
        { x1: divB, y1: downY, x2: width, y2: branchY, type: "branch" },
      ];
      labels = [{ x: width * 0.83, y: branchY + 12, text: "支线", fontSize: 9, anchor: "middle", fill: "#6b7b85" }];
      break;
    }
    // ── 对称支线分岔 ─────────────────────────
    case "symmetric_double_branch": {
      width = length;
      height = 112;
      const branchUpY = upY - branchOffset;
      const branchDnY = downY + branchOffset;
      ports = [
        { id: "L_up", name: "左·上行", side: "left", role: "up_main", x: 0, y: upY, direction: 180 },
        { id: "L_dn", name: "左·下行", side: "left", role: "down_main", x: 0, y: downY, direction: 180 },
        { id: "R_up", name: "右·上行", side: "right", role: "up_main", x: width, y: upY, direction: 0 },
        { id: "R_dn", name: "右·下行", side: "right", role: "down_main", x: width, y: downY, direction: 0 },
        { id: "R_branch_up", name: "右·上支", side: "right", role: "branch", x: width, y: branchUpY, direction: 0 },
        { id: "R_branch_dn", name: "右·下支", side: "right", role: "branch", x: width, y: branchDnY, direction: 0 },
      ];
      const divX = width * 0.5;
      tracks = [
        { x1: 0, y1: upY, x2: width, y2: upY, type: "main" },
        { x1: 0, y1: downY, x2: width, y2: downY, type: "main" },
        { x1: divX, y1: upY, x2: width, y2: branchUpY, type: "branch" },
        { x1: divX, y1: downY, x2: width, y2: branchDnY, type: "branch" },
      ];
      labels = [
        { x: width * 0.83, y: branchUpY - 4, text: "支线", fontSize: 9, anchor: "middle", fill: "#6b7b85" },
        { x: width * 0.83, y: branchDnY + 12, text: "支线", fontSize: 9, anchor: "middle", fill: "#6b7b85" },
      ];
      break;
    }
    // ── 双支线分叉 ───────────────────────────
    case "double_branch": {
      width = length;
      height = 112;
      const branchUpY = centerY - branchOffset;
      const branchDnY = centerY + branchOffset;
      ports = [
        { id: "L_main", name: "左·正线", side: "left", role: "up_main", x: 0, y: centerY, direction: 180 },
        { id: "R_up", name: "右·上支", side: "right", role: "branch", x: width, y: branchUpY, direction: 0 },
        { id: "R_dn", name: "右·下支", side: "right", role: "branch", x: width, y: branchDnY, direction: 0 },
      ];
      const halfX = width * 0.5;
      tracks = [
        { x1: 0, y1: centerY, x2: halfX, y2: centerY, type: "main" },
        { x1: halfX, y1: centerY, x2: width, y2: branchUpY, type: "branch" },
        { x1: halfX, y1: centerY, x2: width, y2: branchDnY, type: "branch" },
      ];
      labels = [{ x: width / 2, y: height - 4, text: "双支线", fontSize: 9, anchor: "middle", fill: "#6b7b85" }];
      break;
    }
    // ── 双线斜向分叉（双线直行 + 双线斜支线 / 双线 Y 形） ───────────
    // 一条双线（upY/downY）分成两条双线。分支端口 direction 取斜段实际角度（atan2），
    // 端口方向就是连接切线方向（connectionLogic 用 unitVector(fromDir)），因此连出去的
    // 支线是真实斜向的。直股对/支线对都用 up_main+down_main 并带车道号（1/2），
    // findDoubleTrackPartner 按尾号配对，连双线区间会自动补对侧走线。
    case "double_fork_up":
    case "double_fork_dn":
    case "double_fork_y": {
      isFork = true;
      const forkKind = base.id === "double_fork_up" ? "up" : base.id === "double_fork_dn" ? "dn" : "y";
      const geometry = buildDoubleForkGeometry(forkKind, length, spacing, branchOffset, alignBranchEnds);
      width = geometry.width;
      height = geometry.height;
      ports = geometry.ports;
      tracks = geometry.tracks;
      labels = geometry.labels;
      break;
    }
    // ── 兜底：返回原模板 ──────────────────────
    default:
      return base;
  }

  // 放宽 length/spacing 范围后，轨道/端口的纵向范围可能超出模板原高度
  // （大 spacing 时 upY 变负、downY 超过 112）。这里统一做几何自适应：
  // 纵向整体下移到 y>=边距，并按轨道/端口实际纵向范围扩高，保证轨道不出框。
  // 约束只看轨道/端口（标签可自然贴近边缘），但平移时标签/站台一并跟随保持相对位置。
  const railExtent: number[] = [];
  for (const track of tracks) { railExtent.push(track.y1, track.y2); }
  for (const port of ports) { railExtent.push(port.y); }
  const minY = Math.min(...railExtent);
  const maxY = Math.max(...railExtent);
  const TOP_MARGIN = 12;
  const BOTTOM_MARGIN = 12;
  if (isFork) {
    // 分叉：输入/直股位置由开口幅度以外的参数决定，开口增大时只让支线外移、模板变高。
    // 不做整体下移（否则输入会随角度移动，破坏吸附对齐），仅当支线真的顶出模板
    // 上沿（y<0，极端角度×大线距）才整体下移兜底；下沿用扩高保证可见。
    height = Math.max(height, maxY + BOTTOM_MARGIN);
    if (minY < 0) {
      const shift = -minY;
      height += shift;
      tracks = tracks.map((track) => ({ ...track, y1: track.y1 + shift, y2: track.y2 + shift }));
      ports = ports.map((port) => ({ ...port, y: port.y + shift }));
      labels = labels.map((textLabel) => ({ ...textLabel, y: textLabel.y + shift }));
      platforms = platforms.map((platform) => ({ ...platform, y: platform.y + shift }));
    }
  } else if (minY < TOP_MARGIN || maxY > height - BOTTOM_MARGIN) {
    const shift = TOP_MARGIN - minY;
    height = Math.max(height, maxY - minY + TOP_MARGIN + BOTTOM_MARGIN);
    tracks = tracks.map((track) => ({ ...track, y1: track.y1 + shift, y2: track.y2 + shift }));
    ports = ports.map((port) => ({ ...port, y: port.y + shift }));
    labels = labels.map((textLabel) => ({ ...textLabel, y: textLabel.y + shift }));
    platforms = platforms.map((platform) => ({ ...platform, y: platform.y + shift }));
  }

  return {
    ...base,
    width,
    height,
    ports,
    tracks,
    platforms,
    labels,
  };
}

