// Client half of the dsh-cursor-glow plugin.
// Registered into the shell's module loader; `apply` runs during boot and
// injects the cursor-glow effect (breathing rainbow halo arrow).
window.__ModuleLoader__.load({
	id: "dsh-cursor-glow",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		function apply(ctx) {
			// ---- cursor glow effect (inject once) ----
			(function () {
				if (window.__cursorGlowInjected) return;
				window.__cursorGlowInjected = true;

				const CONFIG = {
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
				};

				const ARROW_PATH = 'M2 2 L16 12 L11 13 L7 19 Z';

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
					arrow.style.transform = `translate(${mouseX - 2}px, ${mouseY - 2}px)`;
				}

				function tick() {
					const hue = ((performance.now() % CONFIG.hueCycleMs) / CONFIG.hueCycleMs) * 360;
					halo.style.background =
						`radial-gradient(circle, hsla(${hue}, 100%, 82%, 0.8), hsla(${hue}, 100%, 65%, 0.48) 45%, transparent 72%)`;
					requestAnimationFrame(tick);
				}

				window.addEventListener('mousemove', onMove, { passive: true });
				tick();

				window.__cursorGlowStop = function () {
					window.removeEventListener('mousemove', onMove);
					style.remove();
					arrow.remove();
					window.__cursorGlowInjected = false;
				};
			})();

			// dispose cleanup
			return function () {
				if (window.__cursorGlowStop) window.__cursorGlowStop();
			};
		}

		exports.apply = apply;
		return module.exports;
	}
});
