// ============================================================
// DSH Web GUI — 呼吸灯箭头（黑心白边 + 圆形呼吸光晕）
// 单一色相随时间流动 + 呼吸脉动（scale/opacity）。
// 纯 JS/CSS，注入即生效，可配置。
// ============================================================
(function () {
  if (window.__cursorGlowInjected) return;
  window.__cursorGlowInjected = true;

  // ---------- 可调参数 ----------
  const CONFIG = {
    // 箭头
    arrowSize: 24,         // 箭头 SVG 尺寸(px)
    arrowFill: '#000000',  // 箭头填充色（黑心）
    arrowStroke: '#ffffff',// 箭头描边色（白边）
    arrowStrokeWidth: 2,   // 白边粗细
    arrowFillOpacity: 0.4,   // 箭头填充透明度（黑心）
    arrowStrokeOpacity: 0.8, // 箭头描边透明度（白边）

    // 圆形光晕
    haloSize: 28,          // 光晕直径(px)，覆盖整个箭头图标
    haloBlur: 6,           // 光晕模糊(px)
    haloCenterX: 9,        // 光晕中心 X = 箭头图标中心（非尖端）
    haloCenterY: 10.5,     // 光晕中心 Y = 箭头图标中心（非尖端）
    breatheDuration: 2,    // 呼吸周期(秒)
    breatheScaleMin: 0.9,  // 呼吸最小时 scale
    breatheScaleMax: 1.15, // 呼吸最大时 scale
    breatheOpacityMin: 0.52,// 呼吸最淡
    breatheOpacityMax: 0.8, // 呼吸最浓
    hueCycleMs: 6000,      // 色相完整循环一圈的时间(毫秒)，6s
  };

  const ARROW_PATH = 'M2 2 L16 12 L11 13 L7 19 Z';

  // ---------- 注入样式 ----------
  const style = document.createElement('style');
  style.textContent = [
    'html, body, * { cursor: none !important; }',
    '#cursor-glow-arrow {',
    '  position: fixed; top: 0; left: 0;',
    '  pointer-events: none;',
    '  z-index: 2147483647;',
    '  will-change: transform;',
    '}',
    '#cursor-glow-arrow .halo {',
    '  position: absolute;',
    `  width: ${CONFIG.haloSize}px; height: ${CONFIG.haloSize}px;`,
    `  left: ${CONFIG.haloCenterX - CONFIG.haloSize / 2}px; top: ${CONFIG.haloCenterY - CONFIG.haloSize / 2}px;`,
    '  border-radius: 50%;',
    `  filter: blur(${CONFIG.haloBlur}px);`,
    `  animation: cursor-halo-breathe ${CONFIG.breatheDuration}s ease-in-out infinite;`,
    '  z-index: 0;',
    '}',
    '#cursor-glow-arrow svg {',
    '  position: relative;',
    '  z-index: 1;',
    '  display: block;',
    `  width: ${CONFIG.arrowSize}px; height: ${CONFIG.arrowSize}px;`,
    '}',
    '@keyframes cursor-halo-breathe {',
    `  0%, 100% { transform: scale(${CONFIG.breatheScaleMin}); opacity: ${CONFIG.breatheOpacityMin}; }`,
    `  50%      { transform: scale(${CONFIG.breatheScaleMax}); opacity: ${CONFIG.breatheOpacityMax}; }`,
    '}',
  ].join('\n');
  document.head.appendChild(style);

  // ---------- 自定义箭头 ----------
  const arrow = document.createElement('div');
  arrow.id = 'cursor-glow-arrow';
  arrow.setAttribute('aria-hidden', 'true');
  arrow.innerHTML =
    '<div class="halo"></div>' +
    '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">' +
    `<path d="${ARROW_PATH}" fill="${CONFIG.arrowFill}" fill-opacity="${CONFIG.arrowFillOpacity}" stroke="${CONFIG.arrowStroke}" stroke-opacity="${CONFIG.arrowStrokeOpacity}" stroke-width="${CONFIG.arrowStrokeWidth}" stroke-linejoin="round"/>` +
    '</svg>';
  document.body.appendChild(arrow);
  const halo = arrow.querySelector('.halo');

  let mouseX = -9999;
  let mouseY = -9999;

  function onMove(e) {
    mouseX = e.clientX;
    mouseY = e.clientY;
    // 箭头精确跟手（尖端对齐）
    arrow.style.transform = `translate(${mouseX - 2}px, ${mouseY - 2}px)`;
  }

  function tick() {
    // 光晕色相随时间流动（单一色相，彩虹循环）
    const hue = ((performance.now() % CONFIG.hueCycleMs) / CONFIG.hueCycleMs) * 360;
    halo.style.background =
      `radial-gradient(circle, hsla(${hue}, 100%, 82%, 0.8), hsla(${hue}, 100%, 65%, 0.48) 45%, transparent 72%)`;
    requestAnimationFrame(tick);
  }

  window.addEventListener('mousemove', onMove, { passive: true });
  tick();

  // 停止并清理（调试用）
  window.__cursorGlowStop = function () {
    window.removeEventListener('mousemove', onMove);
    style.remove();
    arrow.remove();
    window.__cursorGlowInjected = false;
  };
})();
