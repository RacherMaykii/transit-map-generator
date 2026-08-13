"use client";

import React, { useCallback, useEffect, useState } from "react";

// ── 教程步骤定义 ──────────────────────────────────

export interface TutorialStep {
  id: string;
  title: string;
  description: string;
  /** 高亮目标元素选择器; 多个以逗号分隔 */
  targetSelector?: string;
  /** 提示气泡相对于高亮区域的位置 */
  placement?: "top" | "bottom" | "left" | "right" | "center";
  /** 步骤特有操作按钮 */
  actionLabel?: string;
  actionHint?: string;
  /** 若 targetSelector 要等到元素出现, 则传入 true */
  waitForTarget?: boolean;
  /** 跳过步骤时仍然可用的条件 */
  skippable?: boolean;
}

const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: "welcome",
    title: "欢迎使用配线图编辑器",
    description: `配线图编辑器用于绘制轨道交通线路的轨道布局、道岔、站台和存车线。
本教程将在 7 个步骤内带你快速上手。你可以随时点击"跳过教程"或按 Esc 退出。`,
    placement: "center",
    skippable: true,
  },
  {
    id: "canvas",
    title: "画布与导航",
    description: `这是你的主画布 —— 所有轨道模块都在这里放置和编辑。
• 鼠标滚轮：缩放画布
• 鼠标中键 / 按住 H 键拖拽：平移画布
• 右侧缩放按钮：精细调整视图
• 顶部可切换多张画布`,
    targetSelector: ".wiring-canvas-area",
    placement: "right",
    actionLabel: "试一试：滚轮缩放",
    actionHint: "在画布上滚动鼠标滚轮试试",
  },
  {
    id: "templates",
    title: "元件库与放置模块",
    description: `左侧面板「元件库」包含 22 种轨道模块模板：
• 区间与车站（岛式、侧式、双岛四线等）
• 道岔与连接（左开、右开、渡线、剪式渡线等）
• 场段和存车设施（存车线、停车场、出入段线）

选择一个模板，然后在画布上点击即可放置。启用「连续放置」可以一次放置多个。`,
    targetSelector: ".wiring-left-panel",
    placement: "right",
    actionLabel: "去元件库看看",
    actionHint: "在左侧面板选择一个模板，然后点击画布放置",
  },
  {
    id: "data",
    title: "线路站点与数据",
    description: `切换到「线路站点」标签可以：
• 查看 CSV 导入的线路和站点列表
• 双击未放置的站点或拖拽到画布
• 搜索站点、按线路筛选
• 在「高级模式」中确认物理站映射
• 查看数据变更并接受或忽略`,
    targetSelector: ".wiring-left-tabs",
    placement: "bottom",
    actionLabel: "切换到线路站点",
    actionHint: "点击「线路站点」标签查看数据面板",
  },
  {
    id: "connect",
    title: "连接工具与轨道",
    description: `连接工具（或按 C 键）用于在模块之间创建轨道。
• 点击起点端口 → 点击终点端口
• 标准上下行端口会自动创建双线连接
• 选中连接后可设置：平面交叉、断开、桥梁
• Alt+点击轨道可添加控制点节点
• 双击节点可切换曲率`,
    targetSelector: ".wiring-segmented",
    placement: "bottom",
    actionLabel: "试试连接工具",
    actionHint: "按 C 键或点击工具栏「连接」按钮",
  },
  {
    id: "properties",
    title: "属性面板与图层",
    description: `右侧面板显示选中对象的详细属性。你可以在这里：
• 修改模块位置、旋转、线路关联
• 编辑标签文字、字体、颜色
• 管理图层可见性、锁定和透明度
• 选中多个站台后点击工具栏「换乘」按钮创建换乘组
• 在属性面板中调整换乘组名称、成员和图层

对象拖拽时按住 Shift/Ctrl 可以多选。`,
    targetSelector: ".wiring-right-panel",
    placement: "left",
    actionLabel: "查看属性面板",
  },
  {
    id: "shortcuts",
    title: "快捷键与实用技巧",
    description: `• V — 选择工具    H — 平移工具    C — 连接工具
• Delete — 删除选中    Esc — 取消操作
• Ctrl+Z — 撤销    Ctrl+Shift+Z — 重做    Ctrl+S — 保存
• Shift/Ctrl+点击 — 多选对象
• Alt+点击轨道 — 添加控制点
• Alt+Shift+点击轨道 — 添加交叉点
• 双击连接 — 切换交叉类型   双击模块子对象 — 选中父模块
• 选择 ≥2 个站台 → 点击「换乘」按钮创建换乘组
• 拖拽站点到画布 — 以岛式站台模板放置`,
    placement: "center",
    actionLabel: "开始使用",
    actionHint: "教程完成，开始创作你的配线图吧！",
  },
];

const STORAGE_KEY = "metro-wiring-tutorial-dismissed";

// ── TutorialOverlay 组件 ────────────────────────

export default function TutorialOverlay({
  onDismiss,
  onStepChange,
}: {
  onDismiss: () => void;
  onStepChange?: (stepIndex: number) => void;
}) {
  const [currentStep, setCurrentStep] = useState(0);
  const [position, setPosition] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const [visible, setVisible] = useState(true);

  const step = TUTORIAL_STEPS[currentStep];
  const isLastStep = currentStep === TUTORIAL_STEPS.length - 1;
  const isFirstStep = currentStep === 0;

  // 计算高亮区域
  const updatePosition = useCallback(() => {
    if (!step.targetSelector) {
      setPosition(null);
      return;
    }
    const element = document.querySelector(step.targetSelector);
    if (!element) {
      if (step.waitForTarget) {
        // 轮询等待目标出现
        const timer = window.setTimeout(updatePosition, 200);
        return () => window.clearTimeout(timer);
      }
      setPosition(null);
      return;
    }
    const rect = element.getBoundingClientRect();
    const padding = 6;
    setPosition({
      x: rect.left - padding,
      y: rect.top - padding,
      width: rect.width + padding * 2,
      height: rect.height + padding * 2,
    });
  }, [step]);

  useEffect(() => {
    updatePosition();
    window.addEventListener("resize", updatePosition);
    return () => window.removeEventListener("resize", updatePosition);
  }, [updatePosition]);

  // 快捷键
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        handleDismiss();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        handleNext();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        handlePrev();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [currentStep]);

  // 通知外部步骤变化
  useEffect(() => {
    onStepChange?.(currentStep);
  }, [currentStep, onStepChange]);

  function handleNext() {
    if (isLastStep) {
      handleDismiss();
    } else {
      setCurrentStep((prev) => prev + 1);
    }
  }

  function handlePrev() {
    if (!isFirstStep) {
      setCurrentStep((prev) => prev - 1);
    }
  }

  function handleDismiss() {
    setVisible(false);
    try {
      localStorage.setItem(STORAGE_KEY, "true");
    } catch {
      // localStorage 不可用时静默跳过
    }
    onDismiss();
  }

  function handleSkip() {
    handleDismiss();
  }

  if (!visible) return null;

  // 气泡定位逻辑
  function getBubbleStyle(): React.CSSProperties {
    if (!position || step.placement === "center") {
      return {
        position: "fixed",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        maxWidth: 420,
      };
    }

    const gap = 16;
    const style: React.CSSProperties = {
      position: "fixed",
      maxWidth: 360,
    };

    switch (step.placement) {
      case "top":
        style.bottom = `${window.innerHeight - position.y + gap}px`;
        style.left = `${position.x + position.width / 2}px`;
        style.transform = "translateX(-50%)";
        break;
      case "bottom":
        style.top = `${position.y + position.height + gap}px`;
        style.left = `${position.x + position.width / 2}px`;
        style.transform = "translateX(-50%)";
        break;
      case "left":
        style.right = `${window.innerWidth - position.x + gap}px`;
        style.top = `${position.y + position.height / 2}px`;
        style.transform = "translateY(-50%)";
        break;
      case "right":
        style.left = `${position.x + position.width + gap}px`;
        style.top = `${position.y + position.height / 2}px`;
        style.transform = "translateY(-50%)";
        break;
    }

    return style;
  }

  return (
    <div className="tutorial-overlay-root" role="dialog" aria-modal="false" aria-label="配线图编辑器教程">
      {/* 半透明遮罩 */}
      <div className="tutorial-backdrop" />

      {/* 高亮挖洞 */}
      {position && (
        <div
          className="tutorial-highlight"
          style={{
            left: position.x,
            top: position.y,
            width: position.width,
            height: position.height,
          }}
        />
      )}

      {/* 步骤指示器（底部） */}
      <div className="tutorial-progress-bar">
        {TUTORIAL_STEPS.map((_, index) => (
          <button
            key={TUTORIAL_STEPS[index].id}
            className={`tutorial-dot ${index === currentStep ? "active" : ""} ${
              index < currentStep ? "done" : ""
            }`}
            onClick={() => setCurrentStep(index)}
            title={TUTORIAL_STEPS[index].title}
            aria-label={`跳转到第 ${index + 1} 步：${TUTORIAL_STEPS[index].title}`}
          >
            {index < currentStep ? "✓" : index + 1}
          </button>
        ))}
      </div>

      {/* 气泡卡片 */}
      <div className="tutorial-bubble" style={getBubbleStyle()}>
        {/* 标题 */}
        <div className="tutorial-bubble-header">
          <span className="tutorial-bubble-step">
            第 {currentStep + 1} / {TUTORIAL_STEPS.length} 步
          </span>
          <h3>{step.title}</h3>
        </div>

        {/* 内容 */}
        <div className="tutorial-bubble-body">
          {step.description.split("\n").map((line, index) => {
            const trimmed = line.trim();
            if (!trimmed) return <br key={index} />;
            // 处理列表项
            if (trimmed.startsWith("•")) {
              return (
                <div key={index} className="tutorial-list-item">
                  <span className="tutorial-bullet">•</span>
                  <span>
                    {trimmed.slice(1).split(/(`[^`]+`)/).map((part, partIndex) =>
                      part.startsWith("`") && part.endsWith("`") ? (
                        <kbd key={partIndex}>{part.slice(1, -1)}</kbd>
                      ) : (
                        part
                      ),
                    )}
                  </span>
                </div>
              );
            }
            return <p key={index}>{trimmed}</p>;
          })}
        </div>

        {/* 操作提示 */}
        {step.actionHint && (
          <div className="tutorial-bubble-hint">
            <span className="tutorial-hint-icon">💡</span>
            {step.actionHint}
          </div>
        )}

        {/* 按钮 */}
        <div className="tutorial-bubble-footer">
          <div className="tutorial-footer-left">
            <button className="tutorial-btn-text" onClick={handleSkip}>
              跳过教程
            </button>
          </div>
          <div className="tutorial-footer-right">
            {!isFirstStep && (
              <button className="tutorial-btn" onClick={handlePrev}>
                ← 上一步
              </button>
            )}
            {step.actionLabel && (
              <button className="tutorial-btn primary" onClick={handleNext}>
                {step.actionLabel}
              </button>
            )}
            {!step.actionLabel && (
              <button className="tutorial-btn primary" onClick={handleNext}>
                {isLastStep ? "✓ 完成" : "下一步 →"}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 内联样式（不依赖外部 CSS 的辅助） */}
      <style>{`
        .tutorial-overlay-root {
          position: fixed;
          inset: 0;
          z-index: 10000;
          pointer-events: none;
        }
        .tutorial-overlay-root * {
          pointer-events: auto;
        }
        .tutorial-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(20, 49, 63, 0.55);
        }
        .tutorial-highlight {
          position: fixed;
          border-radius: 10px;
          box-shadow: 0 0 0 9999px rgba(20, 49, 63, 0.55), 0 0 0 2px var(--accent, #087FA4);
          pointer-events: none;
        }
        .tutorial-progress-bar {
          position: fixed;
          bottom: 28px;
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          gap: 10px;
          z-index: 10001;
        }
        .tutorial-dot {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          border: 2px solid rgba(255,255,255,0.5);
          background: rgba(255,255,255,0.15);
          color: white;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s ease;
        }
        .tutorial-dot.active {
          border-color: white;
          background: white;
          color: var(--accent, #087FA4);
          box-shadow: 0 0 20px rgba(255,255,255,0.4);
          transform: scale(1.15);
        }
        .tutorial-dot.done {
          border-color: rgba(255,255,255,0.8);
          background: rgba(255,255,255,0.5);
          color: white;
        }
        .tutorial-dot:hover {
          border-color: white;
          transform: scale(1.1);
        }
        .tutorial-dot.active:hover {
          transform: scale(1.15);
        }
        .tutorial-bubble {
          background: white;
          border-radius: 14px;
          box-shadow: 0 12px 40px rgba(20, 49, 63, 0.22), 0 2px 8px rgba(20, 49, 63, 0.08);
          overflow: hidden;
          z-index: 10001;
        }
        .tutorial-bubble-header {
          padding: 18px 22px 0;
        }
        .tutorial-bubble-step {
          font-size: 10px;
          font-weight: 700;
          color: var(--accent, #087FA4);
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }
        .tutorial-bubble h3 {
          margin: 4px 0 0;
          font-size: 17px;
          font-weight: 800;
          color: #202124;
          letter-spacing: -0.01em;
        }
        .tutorial-bubble-body {
          padding: 12px 22px 14px;
        }
        .tutorial-bubble-body p {
          margin: 0 0 6px;
          font-size: 13px;
          line-height: 1.55;
          color: #5a6c75;
        }
        .tutorial-bubble-body p:last-child {
          margin-bottom: 0;
        }
        .tutorial-list-item {
          display: flex;
          gap: 8px;
          margin-bottom: 4px;
          font-size: 13px;
          line-height: 1.55;
          color: #5a6c75;
        }
        .tutorial-bullet {
          flex: 0 0 auto;
          color: var(--accent, #087FA4);
          font-weight: 700;
        }
        .tutorial-list-item kbd {
          display: inline-block;
          padding: 1px 6px;
          border-radius: 4px;
          border: 1px solid #dce4e8;
          background: #f0f4f5;
          font-family: "Consolas", "Fira Code", monospace;
          font-size: 11px;
          font-weight: 700;
          color: #202124;
        }
        .tutorial-bubble-hint {
          margin: 0 22px 6px;
          padding: 10px 14px;
          background: #f5fcfe;
          border: 1px solid #cce5f2;
          border-radius: 8px;
          font-size: 12px;
          color: #087FA4;
          display: flex;
          align-items: flex-start;
          gap: 8px;
        }
        .tutorial-hint-icon {
          flex: 0 0 auto;
          font-size: 15px;
        }
        .tutorial-bubble-footer {
          padding: 10px 22px 18px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }
        .tutorial-footer-left {
          flex: 0 0 auto;
        }
        .tutorial-footer-right {
          flex: 1;
          display: flex;
          justify-content: flex-end;
          gap: 8px;
        }
        .tutorial-btn {
          min-height: 34px;
          padding: 0 14px;
          border-radius: 8px;
          border: 1px solid #dce4e8;
          background: white;
          font-size: 12px;
          font-weight: 700;
          color: #202124;
          cursor: pointer;
          transition: all 0.15s ease;
          white-space: nowrap;
        }
        .tutorial-btn:hover {
          border-color: var(--accent, #087FA4);
          background: #f5fcfe;
        }
        .tutorial-btn.primary {
          background: var(--accent, #087FA4);
          color: white;
          border-color: var(--accent, #087FA4);
          box-shadow: 0 3px 10px rgba(8, 127, 164, 0.2);
        }
        .tutorial-btn.primary:hover {
          background: #066a8a;
        }
        .tutorial-btn-text {
          background: none;
          border: none;
          font-size: 12px;
          color: #9aa7af;
          cursor: pointer;
          text-decoration: underline;
          padding: 4px;
        }
        .tutorial-btn-text:hover {
          color: #5a6c75;
        }
      `}</style>
    </div>
  );
}

// ── 辅助 hook ────────────────────────────────────

/** 判断教程是否已关闭过 */
export function useTutorialState(): {
  showTutorial: boolean;
  dismissTutorial: () => void;
  resetTutorial: () => void;
} {
  const [showTutorial, setShowTutorial] = useState(false);

  useEffect(() => {
    try {
      const dismissed = localStorage.getItem(STORAGE_KEY);
      setShowTutorial(dismissed !== "true");
    } catch {
      setShowTutorial(true);
    }
  }, []);

  const dismissTutorial = useCallback(() => {
    setShowTutorial(false);
    try {
      localStorage.setItem(STORAGE_KEY, "true");
    } catch {
      // 静默
    }
  }, []);

  const resetTutorial = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // 静默
    }
    setShowTutorial(true);
  }, []);

  return { showTutorial, dismissTutorial, resetTutorial };
}
