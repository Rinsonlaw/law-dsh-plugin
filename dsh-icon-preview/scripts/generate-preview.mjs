// 生成 preview/preview.html：从 @deepseek-ai/dsh-client-ui-primitives 提取所有
// Icon* 组件，用 React SSR 渲染成 SVG 字符串，生成一个可离线打开的图标总览页。
//
// 用法：node scripts/generate-preview.mjs
// 依赖 DSH 的 node_modules（react / react-dom / primitives），路径见 DSH_NODE_MODULES。

import fs from 'node:fs'
import { createRequire } from 'node:module'

// DSH 安装的 node_modules 根目录（npx 缓存；如移动过请改这里或用环境变量覆盖）。
const BASE = process.env.DSH_NODE_MODULES || '/Users/law/.npm/_npx/1e7f6d9597241db0/node_modules'
const require = createRequire(`${BASE}/`)

const { renderToStaticMarkup } = require('react-dom/server')
const { jsx, jsxs } = require('react/jsx-runtime')

const primitivesIndex = require.resolve('@deepseek-ai/dsh-client-ui-primitives')
const src = fs.readFileSync(primitivesIndex, 'utf8')

// 每个图标形如：const IconName = ({ size = 16, className }) => jsx("svg", {...});
const re = /^const (Icon\w+) = \([\s\S]*?\n\};?\s*\)/gm
const icons = {}
for (const m of src.matchAll(re)) {
  const name = m[1]
  const fnCode = m[0].replace(/^const \w+ = /, '')
  const fn = new Function('jsx', 'jsxs', `return (${fnCode})`)
  const Comp = fn(jsx, jsxs)
  icons[name] = renderToStaticMarkup(Comp({ size: 18 }))
}

const names = Object.keys(icons).sort()

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const cards = names.map(name =>
  `      <div class="card" data-name="${esc(name)}" title="点击复制 ${esc(name)}">\n` +
  `        <div class="glyph">${icons[name]}</div>\n` +
  `        <div class="name">${esc(name)}</div>\n` +
  `      </div>`
).join('\n')

const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>DSH 图标预览</title>
  <style>
    :root { color-scheme: dark; }
    * { margin: 0; box-sizing: border-box; }
    body {
      min-height: 100vh;
      font-family: -apple-system, "PingFang SC", "Segoe UI", sans-serif;
      background: #0f1115; color: #e6e6e6; font-size: 13px;
    }
    .wrap { max-width: 1200px; margin: 0 auto; padding: 24px 20px 60px; }
    header { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 8px; }
    h1 { font-size: 20px; font-weight: 700; }
    .count { color: #8b94a7; }
    .search {
      flex: 1 1 240px; min-width: 180px; font: inherit; font-size: 13px;
      color: #e6e6e6; background: #1a1d24; border: 1px solid rgba(255,255,255,.1);
      border-radius: 8px; padding: 6px 12px; outline: none;
    }
    .search:focus { border-color: #4c8dff; }
    .hint { color: #8b94a7; margin-bottom: 16px; }
    .grid {
      display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 10px;
    }
    .card {
      display: flex; flex-direction: column; align-items: center; gap: 10px;
      padding: 16px 10px; border: 1px solid rgba(255,255,255,.08); border-radius: 12px;
      background: #1a1d24; cursor: pointer; transition: border-color .15s, background .15s, transform .05s;
    }
    .card:hover { border-color: #4c8dff; background: #22262f; }
    .card:active { transform: scale(.98); }
    .glyph { display: flex; align-items: center; justify-content: center; width: 34px; height: 34px; color: #c9d1d9; }
    .glyph svg { display: block; }
    .name {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px;
      color: #8b94a7; word-break: break-all; text-align: center; line-height: 15px;
    }
    .toast {
      position: fixed; left: 50%; bottom: 32px; transform: translateX(-50%) translateY(20px);
      background: #2b303b; color: #e6e6e6; border: 1px solid rgba(255,255,255,.12);
      border-radius: 8px; padding: 8px 16px; font-size: 13px; opacity: 0;
      transition: opacity .2s, transform .2s; pointer-events: none; z-index: 10;
    }
    .toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }
  </style>
</head>
<body>
  <div class="wrap">
    <header>
      <h1>DSH 图标预览</h1>
      <span class="count">共 ${names.length} 个</span>
      <input class="search" id="search" placeholder="搜索图标名称…" />
    </header>
    <p class="hint">来源 @deepseek-ai/dsh-client-ui-primitives · 点击任意图标复制其名称</p>
    <div class="grid" id="grid">
${cards}
    </div>
  </div>
  <div class="toast" id="toast"></div>

  <script>
    const grid = document.getElementById('grid')
    const search = document.getElementById('search')
    const toast = document.getElementById('toast')
    let timer = null

    function copy(text) {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(text)
      }
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      return Promise.resolve()
    }

    function showToast(text) {
      toast.textContent = text
      toast.classList.add('show')
      clearTimeout(timer)
      timer = setTimeout(() => toast.classList.remove('show'), 1400)
    }

    grid.addEventListener('click', e => {
      const card = e.target.closest('.card')
      if (!card) return
      const name = card.dataset.name
      copy(name).then(
        () => showToast('已复制 ' + name),
        () => showToast('复制失败，请手动复制：' + name),
      )
    })

    search.addEventListener('input', () => {
      const q = search.value.trim().toLowerCase()
      for (const card of grid.children) {
        const hit = card.dataset.name.toLowerCase().includes(q)
        card.style.display = hit ? '' : 'none'
      }
    })
  </script>
</body>
</html>
`

const out = new URL('../preview/preview.html', import.meta.url).pathname
fs.mkdirSync(new URL('../preview', import.meta.url).pathname, { recursive: true })
fs.writeFileSync(out, html)
console.log(`生成 ${names.length} 个图标 → ${out}`)
