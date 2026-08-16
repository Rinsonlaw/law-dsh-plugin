// Pure, framework-agnostic cursor-glow rendering for dsh-cursor-glow.
//
// This module is the SINGLE source of truth for the breathing rainbow-halo
// cursor effect. It is shared two ways:
//   - `lib/client.js` (the browser bundle) inlines it via `scripts/build.mjs`;
//   - `preview/preview.html` is generated from it by the same script.
// Nothing in here touches React, the DOM, localStorage, or the DSH module
// loader — every function is pure and returns strings or numbers.

export const ARROW_PATH = 'M2 2 L16 12 L11 13 L7 19 Z'

// Default parameters for the effect. The settings panel edits a runtime copy
// of this object; changing a default here only needs a rebuild to propagate
// to both the plugin and the standalone preview.
export const DEFAULT_CONFIG = {
  arrowSize: 24,
  arrowFill: '#000000',
  arrowStroke: '#ffffff',
  arrowStrokeWidth: 2,
  arrowFillOpacity: 0.4,
  arrowStrokeOpacity: 0.8,

  haloSize: 28,
  haloBlur: 6,
  haloCenterX: 9,
  haloCenterY: 10.5,

  breatheDuration: 2,
  breatheScaleMin: 0.9,
  breatheScaleMax: 1.15,
  breatheOpacityMin: 0.52,
  breatheOpacityMax: 0.8,
  hueCycleMs: 6000,
}

// Parameter schema for the settings UI. The plugin's React settings panel and
// the standalone preview both render their controls from this single list, so
// the adjustable parameters (labels, ranges, steps, units) can never drift.
export const PARAM_GROUPS = [
  {
    title: '箭头 Arrow',
    fields: [
      { key: 'arrowSize', label: '尺寸', type: 'range', min: 12, max: 48, step: 1, unit: ' px' },
      { key: 'arrowFill', label: '填充色', type: 'color' },
      { key: 'arrowFillOpacity', label: '填充透明度', type: 'range', min: 0, max: 1, step: 0.01 },
      { key: 'arrowStroke', label: '描边色', type: 'color' },
      { key: 'arrowStrokeOpacity', label: '描边透明度', type: 'range', min: 0, max: 1, step: 0.01 },
      { key: 'arrowStrokeWidth', label: '描边粗细', type: 'range', min: 0.5, max: 8, step: 0.5, unit: ' px' },
    ],
  },
  {
    title: '光晕 Halo',
    fields: [
      { key: 'haloSize', label: '直径', type: 'range', min: 12, max: 80, step: 1, unit: ' px' },
      { key: 'haloBlur', label: '模糊', type: 'range', min: 0, max: 20, step: 0.5, unit: ' px' },
      { key: 'haloCenterX', label: '中心 X', type: 'range', min: 0, max: 24, step: 0.5, unit: ' px', hint: '箭头图标中心' },
      { key: 'haloCenterY', label: '中心 Y', type: 'range', min: 0, max: 24, step: 0.5, unit: ' px', hint: '箭头图标中心' },
    ],
  },
  {
    title: '呼吸动画 Breathing',
    fields: [
      { key: 'breatheDuration', label: '周期', type: 'range', min: 0.5, max: 6, step: 0.1, unit: ' s' },
      { key: 'breatheScaleMin', label: '缩放下限', type: 'range', min: 0.5, max: 1.5, step: 0.01 },
      { key: 'breatheScaleMax', label: '缩放上限', type: 'range', min: 0.5, max: 2, step: 0.01 },
      { key: 'breatheOpacityMin', label: '透明度下限', type: 'range', min: 0, max: 1, step: 0.01 },
      { key: 'breatheOpacityMax', label: '透明度上限', type: 'range', min: 0, max: 1, step: 0.01 },
    ],
  },
  {
    title: '色相流动 Hue Cycle',
    fields: [
      { key: 'hueCycleMs', label: '周期', type: 'range', min: 1000, max: 20000, step: 500, unit: ' ms' },
    ],
  },
]

// The injected <style> text for a given config.
export function buildCss(cfg) {
  return [
    'html, body, * { cursor: none !important; }',
    '#cursor-glow-arrow {',
    '  position: fixed; top: 0; left: 0;',
    '  pointer-events: none;',
    '  z-index: 2147483647;',
    '  will-change: transform;',
    '}',
    '#cursor-glow-arrow .halo {',
    '  position: absolute;',
    '  width: ' + cfg.haloSize + 'px; height: ' + cfg.haloSize + 'px;',
    '  left: ' + (cfg.haloCenterX - cfg.haloSize / 2) + 'px; top: ' + (cfg.haloCenterY - cfg.haloSize / 2) + 'px;',
    '  border-radius: 50%;',
    '  filter: blur(' + cfg.haloBlur + 'px);',
    '  animation: cursor-halo-breathe ' + cfg.breatheDuration + 's ease-in-out infinite;',
    '  z-index: 0;',
    '}',
    '#cursor-glow-arrow svg {',
    '  position: relative;',
    '  z-index: 1;',
    '  display: block;',
    '  width: ' + cfg.arrowSize + 'px; height: ' + cfg.arrowSize + 'px;',
    '}',
    '@keyframes cursor-halo-breathe {',
    '  0%, 100% { transform: scale(' + cfg.breatheScaleMin + '); opacity: ' + cfg.breatheOpacityMin + '; }',
    '  50%      { transform: scale(' + cfg.breatheScaleMax + '); opacity: ' + cfg.breatheOpacityMax + '; }',
    '}',
  ].join('\n')
}

// The inner HTML of #cursor-glow-arrow (halo + arrow SVG), with the path's
// paint attributes baked in from config.
export function arrowMarkup(cfg) {
  return (
    '<div class="halo"></div>' +
    '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="' + ARROW_PATH + '"' +
    ' fill="' + cfg.arrowFill + '"' +
    ' fill-opacity="' + cfg.arrowFillOpacity + '"' +
    ' stroke="' + cfg.arrowStroke + '"' +
    ' stroke-opacity="' + cfg.arrowStrokeOpacity + '"' +
    ' stroke-width="' + cfg.arrowStrokeWidth + '"' +
    ' stroke-linejoin="round"/>' +
    '</svg>'
  )
}

// Hue (0-360) of the halo gradient at a given timestamp.
export function hueAt(nowMs, cycleMs) {
  return ((nowMs % cycleMs) / cycleMs) * 360
}

// The radial-gradient background for the halo at a given hue.
export function haloBackground(hue) {
  return (
    'radial-gradient(circle, hsla(' + hue + ', 100%, 82%, 0.8),' +
    ' hsla(' + hue + ', 100%, 65%, 0.48) 45%, transparent 72%)'
  )
}

// X/Y offset (px) so the arrow's tip (at 2,2 in the 24-unit viewBox) stays
// under the pointer for any arrowSize.
export function tipOffset(cfg) {
  return cfg.arrowSize / 12
}
