"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";

// ── 弹出菜单项类型 ──────────────────────────────

export interface PopoverAction {
  kind: "action";
  id: string;
  label: string;
  icon?: string;
  shortcut?: string;
  onClick: () => void;
  danger?: boolean;
}

export interface PopoverSeparator {
  kind: "separator";
  id: string;
}

export interface PopoverCheckbox {
  kind: "checkbox";
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  title?: string;
}

export interface PopoverSelect {
  kind: "select";
  id: string;
  label: string;
  value: string | number;
  options: { value: string | number; label: string }[];
  onChange: (value: string) => void;
}

export interface PopoverSection {
  kind: "section";
  id: string;
  label: string;
  defaultExpanded?: boolean;
  items: PopoverMenuItem[];
}

export type PopoverMenuItem =
  | PopoverAction
  | PopoverSeparator
  | PopoverCheckbox
  | PopoverSelect
  | PopoverSection;

export interface PopoverMenuProps {
  label: string;
  icon?: string;
  items: PopoverMenuItem[];
  /** 角标（如激活筛选数） */
  badge?: number | string;
  align?: "left" | "right";
  /** 最小宽度 */
  minWidth?: number;
}

// ── 组件 ────────────────────────────────────────

/**
 * section 作为独立组件渲染，让 useState 拥有自己的 hook 上下文。
 * 不能在父组件的 .map(renderItem) 回调里直接调 useState：弹层关闭时不渲染该项（0 个 hook）、
 * 打开时渲染（1 个 hook），连续渲染间 hook 数量变化会触发 "Rendered more hooks than during
 * the previous render" 崩溃，导致整个编辑器空白页（.verify/probe-filter.mjs 复现）。
 */
function PopoverSectionItem({ item, renderItem }: { item: PopoverSection; renderItem: (item: PopoverMenuItem) => React.ReactNode }) {
  const [expanded, setExpanded] = useState(item.defaultExpanded ?? false);
  return (
    <div className="popover-section">
      <button
        className="popover-section-header"
        onClick={() => setExpanded((prev) => !prev)}
      >
        <span className={`popover-section-arrow ${expanded ? "open" : ""}`}>▸</span>
        <span>{item.label}</span>
      </button>
      {expanded && (
        <div className="popover-section-body">
          {item.items.map(renderItem)}
        </div>
      )}
    </div>
  );
}

export default function PopoverMenu({
  label,
  icon,
  items,
  badge,
  align = "left",
  minWidth = 200,
}: PopoverMenuProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);

  // 点击外部关闭
  useEffect(() => {
    if (!open) return;
    const handler = (event: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(event.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(event.target as Node)
      ) {
        close();
      }
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [open, close]);

  // Esc 关闭
  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, close]);

  // 计算弹出位置
  const panelStyle: React.CSSProperties = {
    minWidth,
    position: "absolute",
    top: "calc(100% + 6px)",
    ...(align === "right" ? { right: 0 } : { left: 0 }),
    zIndex: 5000,
  };

  function renderItem(item: PopoverMenuItem) {
    switch (item.kind) {
      case "action":
        return (
          <button
            key={item.id}
            className={`popover-item popover-action ${item.danger ? "danger" : ""}`}
            onClick={() => {
              item.onClick();
              close();
            }}
          >
            {item.icon && <span className="popover-item-icon">{item.icon}</span>}
            <span className="popover-item-label">{item.label}</span>
            {item.shortcut && <span className="popover-item-shortcut">{item.shortcut}</span>}
          </button>
        );

      case "separator":
        return <div key={item.id} className="popover-separator" />;

      case "checkbox":
        return (
          <label
            key={item.id}
            className="popover-item popover-checkbox"
            title={item.title}
          >
            <input
              type="checkbox"
              checked={item.checked}
              onChange={(e) => item.onChange(e.target.checked)}
            />
            <span>{item.label}</span>
          </label>
        );

      case "select":
        return (
          <div key={item.id} className="popover-item popover-select-row">
            <span className="popover-select-label">{item.label}</span>
            <select
              className="popover-select"
              value={item.value}
              onChange={(e) => {
                item.onChange(e.target.value);
                // select 不自动关闭，让用户继续操作
              }}
            >
              {item.options.map((opt) => (
                <option key={String(opt.value)} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        );

      case "section":
        return <PopoverSectionItem key={item.id} item={item} renderItem={renderItem} />;

      default:
        return null;
    }
  }

  return (
    <div className="popover-menu-root">
      <button
        ref={triggerRef}
        className={`wiring-btn popover-trigger ${open ? "active" : ""}`}
        onClick={() => setOpen((prev) => !prev)}
        title={label}
      >
        {icon && <span className="popover-trigger-icon">{icon}</span>}
        <span>{label}</span>
        <span className="popover-trigger-arrow">▾</span>
        {badge !== undefined && badge !== 0 && badge !== "" && (
          <span className="popover-badge">{badge}</span>
        )}
      </button>

      {open && (
        <>
          {/* 透明遮罩（捕获外部点击） */}
          <div className="popover-backdrop" onClick={close} />
          <div ref={panelRef} className="popover-panel" style={panelStyle}>
            {items.map(renderItem)}
          </div>
        </>
      )}
    </div>
  );
}
