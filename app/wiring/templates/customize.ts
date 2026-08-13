// ──────────────────────────────────────────────
// 配线图编辑器 · 动态模板工厂
// 从 templates.ts 拆出（makeCustomizedTemplate），逐字保留原实现。
// ──────────────────────────────────────────────

import { DOWN_MAIN_Y, UP_MAIN_Y, type ModulePort, type ModuleTemplate, type TemplateLabel, type TemplatePlatform, type TemplateTrack } from "../types";

// ── 动态模板工厂 ──────────────────────────────

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
  const hasAngle = base.params?.some(pp => pp.key === "angle");
  const hasPlatformLength = base.params?.some(pp => pp.key === "platformLength");
  const hasPlatformWidth = base.params?.some(pp => pp.key === "platformWidth");

  const length = hasLength ? p("length") : base.width;
  const spacing = hasSpacing ? p("spacing") : (DOWN_MAIN_Y - UP_MAIN_Y);
  const branchOffset = hasBranchOffset ? p("branchOffset") : 24;
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
  // 分叉：开合角度只移动支线端口，直股/输入固定。为保持输入位置不变，分叉的几何
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
      width = length;
      isFork = true;
      const forkKind = base.id === "double_fork_up" ? "up" : base.id === "double_fork_dn" ? "dn" : "y";
      // 开合角度 angle（度）→ 斜段纵向落差 k（支线对在输出端相对直股对的张开量）。
      // 与道岔的「开口幅度」一致：分叉点固定在中点、直股/输入端口位置不动，只移动
      // 支线输出端口；开大时支线超出原边界、模板随之变高。默认角（上 26.2 / 下 23.3 /
      // Y 17.1）复现静态几何，故默认保持可对齐（输入端口 y 与角度无关）。
      const angle = hasAngle ? p("angle") : forkKind === "up" ? 26.2 : forkKind === "dn" ? 23.3 : 17.1;
      // 输入/直股锚点：不随开合角度移动（保证吸附对齐）。上分叉默认组间隙 24、
      // 下分叉取标准位、Y 形居中，使默认几何与静态基准一致。
      const inUp = forkKind === "y" ? 12 + spacing : forkKind === "up" ? 12 + spacing + 24 : 56 - spacing / 2;
      const inDn = inUp + spacing;
      // 斜段纵向落差 k = 开合角度对应的张开量；不得小于线间距（上/下分叉的支线对整组
      // 在直股对上方/下方，两组之间不交叉、不重叠）。Y 形两分支之间留 ≥ spacing/2，
      // 使上下两支刚好相触为最紧状态，避免两支互相穿越。
      const k = Math.max(
        Math.round((width / 2) * Math.tan((angle * Math.PI) / 180)),
        forkKind === "y" ? spacing / 2 : spacing,
      );
      // 分叉点固定在中点。
      const divX = Math.round(width / 2);
      // 端口方向取斜段真实角度（k 可能被线间距下限夹住，方向必须与渲染斜轨一致）
      const angleRise = (Math.round(Math.atan2(-k, width - divX) * 180 / Math.PI) % 360 + 360) % 360;
      const angleFall = (Math.round(Math.atan2(k, width - divX) * 180 / Math.PI) % 360 + 360) % 360;
      if (forkKind === "y") {
        // Y 形：双线一进二出。上支整体上移 k、下支整体下移 k，各成一对双线斜出。
        // 高度同时容纳上支顶部与下支底部（开大时两端一起变高）。
        height = Math.max(inDn + k + 12, inUp - k + 12);
        ports = [
          { id: "L_up1", name: "左·上行", side: "left", role: "up_main", x: 0, y: inUp, direction: 180 },
          { id: "L_dn1", name: "左·下行", side: "left", role: "down_main", x: 0, y: inDn, direction: 180 },
          { id: "R_up1", name: "右·上支上行", side: "right", role: "up_main", x: width, y: inUp - k, direction: angleRise },
          { id: "R_dn1", name: "右·上支下行", side: "right", role: "down_main", x: width, y: inDn - k, direction: angleRise },
          { id: "R_up2", name: "右·下支上行", side: "right", role: "up_main", x: width, y: inUp + k, direction: angleFall },
          { id: "R_dn2", name: "右·下支下行", side: "right", role: "down_main", x: width, y: inDn + k, direction: angleFall },
        ];
        tracks = [
          { x1: 0, y1: inUp, x2: divX, y2: inUp, type: "main" },
          { x1: 0, y1: inDn, x2: divX, y2: inDn, type: "main" },
          { x1: divX, y1: inUp, x2: width, y2: inUp - k, type: "branch" },
          { x1: divX, y1: inDn, x2: width, y2: inDn - k, type: "branch" },
          { x1: divX, y1: inUp, x2: width, y2: inUp + k, type: "branch" },
          { x1: divX, y1: inDn, x2: width, y2: inDn + k, type: "branch" },
        ];
        labels = [{ x: 40, y: 36, text: "Y形分叉", fontSize: 9, anchor: "middle", fill: "#6b7b85" }];
      } else {
        // 直股双线照常水平直行（输入锚点固定）；支线双线整体平移 k 与直股分开。
        height = forkKind === "up" ? inDn + 12 : inDn + k + 12;
        const branchUpY = forkKind === "up" ? inUp - k : inUp + k;
        const branchDnY = forkKind === "up" ? inDn - k : inDn + k;
        const angle = forkKind === "up" ? angleRise : angleFall;
        ports = [
          { id: "L_up1", name: "左·上行", side: "left", role: "up_main", x: 0, y: inUp, direction: 180 },
          { id: "L_dn1", name: "左·下行", side: "left", role: "down_main", x: 0, y: inDn, direction: 180 },
          { id: "R_up1", name: "右·直股上行", side: "right", role: "up_main", x: width, y: inUp, direction: 0 },
          { id: "R_dn1", name: "右·直股下行", side: "right", role: "down_main", x: width, y: inDn, direction: 0 },
          { id: "R_up2", name: "右·支线上行", side: "right", role: "up_main", x: width, y: branchUpY, direction: angle },
          { id: "R_dn2", name: "右·支线下行", side: "right", role: "down_main", x: width, y: branchDnY, direction: angle },
        ];
        tracks = [
          { x1: 0, y1: inUp, x2: width, y2: inUp, type: "main" },
          { x1: 0, y1: inDn, x2: width, y2: inDn, type: "main" },
          { x1: divX, y1: inUp, x2: width, y2: branchUpY, type: "branch" },
          { x1: divX, y1: inDn, x2: width, y2: branchDnY, type: "branch" },
        ];
        labels = [
          forkKind === "up"
            ? { x: 40, y: 30, text: "上分叉", fontSize: 9, anchor: "middle", fill: "#6b7b85" }
            : { x: 40, y: 26, text: "下分叉", fontSize: 9, anchor: "middle", fill: "#6b7b85" },
        ];
      }
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
    // 分叉：输入/直股位置由开合角度以外的参数决定，角度开大时只让支线外移、模板变高。
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

