"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "metro-wiring-first-use-notice-dismissed-v1";

export function useFirstUseNoticeState() {
  const [showFirstUseNotice, setShowFirstUseNotice] = useState(false);

  useEffect(() => {
    try {
      setShowFirstUseNotice(localStorage.getItem(STORAGE_KEY) !== "true");
    } catch {
      setShowFirstUseNotice(true);
    }
  }, []);

  const dismissFirstUseNotice = useCallback(() => {
    setShowFirstUseNotice(false);
    try {
      localStorage.setItem(STORAGE_KEY, "true");
    } catch {
      // localStorage 不可用时仍允许继续使用。
    }
  }, []);

  return { showFirstUseNotice, dismissFirstUseNotice };
}

export default function FirstUseNotice({ onConfirm }: { onConfirm: () => void }) {
  return (
    <div className="wiring-first-use-backdrop" role="presentation">
      <section
        className="wiring-first-use-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="wiring-first-use-title"
        aria-describedby="wiring-first-use-description"
      >
        <header>
          <span className="wiring-first-use-eyebrow">首次使用提示</span>
          <h2 id="wiring-first-use-title">使用范围与安全说明</h2>
        </header>
        <div className="wiring-first-use-body" id="wiring-first-use-description">
          <p className="wiring-first-use-warning">
            本品是<span>非专业轨道工程软件</span>，仅供娱乐、创作和示意图制作。
          </p>
          <ul>
            <li>生成内容不能作为真实线路规划、施工设计、运营组织或安全评估依据。</li>
            <li>软件中的线路、站场和信号表达经过简化，不保证符合行业规范。</li>
            <li>涉及真实工程与安全决策时，请以专业单位、现行规范和正式图纸为准。</li>
          </ul>
        </div>
        <footer>
          <button type="button" className="wiring-btn primary" onClick={onConfirm} autoFocus>
            我已了解，继续使用
          </button>
        </footer>
      </section>
    </div>
  );
}
