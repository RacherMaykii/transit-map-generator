"use client";

// 设置弹窗共用的输入控件，从 TransitMapApp.tsx 拆出（原 183–240 逐字迁移）。
// TransitMapApp 的站点/线路编辑器仍使用 ColorField，从本模块 re-import。

export function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const safe = /^#[0-9a-f]{6}$/i.test(value) ? value : "#000000";
  return (
    <label className="color-field">
      <span>{label}</span>
      <span className="color-controls">
        <input
          aria-label={`${label}取色器`}
          type="color"
          value={safe}
          onChange={(event) => onChange(event.target.value.toUpperCase())}
        />
        <input
          aria-label={`${label}十六进制颜色`}
          className="hex-input"
          value={value}
          maxLength={9}
          onChange={(event) => onChange(event.target.value.toUpperCase())}
          placeholder="#12AEFF"
        />
      </span>
    </label>
  );
}

export function NumberSetting({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="number-setting">
      <span><b>{label}</b><output>{value}px</output></span>
      <span className="number-setting-controls">
        <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
        <input type="number" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
      </span>
    </label>
  );
}
