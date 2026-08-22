// Pure, framework-agnostic graph rendering for dsh-git-graph.
//
// This module is the SINGLE source of truth for the commit-graph layout and
// HTML/SVG generation. It is shared two ways:
//   - `lib/client.js` (the browser bundle) inlines it via `scripts/build.mjs`;
//   - `preview/preview.html` is generated from it by the same script.
// Nothing in here touches React, the DOM, or the DSH module loader — every
// function is a pure function that returns strings (HTML or SVG).

export const ROW_H = 32
export const COL_W = 16
export const NODE_R = 4.5
export const CORNER_R = 5
export const PAD_X = 6

// Branch colors (assigned per branch name, high-distinction palette).
export const BRANCH_COLORS = [
  '#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#a855f7',
  '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#14b8a6',
]
export const FALLBACK_COLOR = '#8b94a7'

export function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Branch names referenced by a commit's `%D` refs (tags and bare HEAD skipped). */
export function branchNames(refs) {
  const names = []
  for (const r of refs) {
    if (!r || r === 'HEAD' || r.startsWith('tag: ')) continue
    let name = r
    if (r.startsWith('HEAD -> ')) name = r.slice(8).trim()
    name = name.replace(/^(origin|upstream|github)\//, '')
    if (name) names.push(name)
  }
  return names
}

/** Branch priority so main/develop/release/hotfix/feature get stable colors. */
export function branchRank(name) {
  if (name === 'main' || name === 'master') return 0
  if (name === 'develop' || name === 'dev') return 1
  if (name.startsWith('release')) return 2
  if (name.startsWith('hotfix')) return 3
  if (name.startsWith('feature')) return 4
  return 5
}

/**
 * Stable color per branch: assign colors in priority order, then walk each
 * branch tip's first-parent chain, coloring commits; later branches stop at
 * already-colored commits. Returns Map<hash, color>.
 */
export function branchColors(rows) {
  const byHash = new Map(rows.map(r => [r.hash, r]))
  // branch name -> tip hash (first commit carrying that name, newest first)
  const branchTip = new Map()
  rows.forEach(c => {
    for (const name of branchNames(c.refs)) {
      if (!branchTip.has(name)) branchTip.set(name, c.hash)
    }
  })
  const sortedNames = [...branchTip.keys()].sort((a, b) => {
    const ra = branchRank(a), rb = branchRank(b)
    return ra !== rb ? ra - rb : (a < b ? -1 : a > b ? 1 : 0)
  })
  const colorOfBranch = new Map()
  sortedNames.forEach((name, i) => { colorOfBranch.set(name, BRANCH_COLORS[i % BRANCH_COLORS.length]) })
  const colorOf = new Map()
  for (const name of sortedNames) {
    const color = colorOfBranch.get(name)
    let hash = branchTip.get(name)
    while (hash) {
      if (colorOf.has(hash)) break
      colorOf.set(hash, color)
      hash = byHash.get(hash)?.parents[0] ?? null
    }
  }
  rows.forEach(c => { if (!colorOf.has(c.hash)) colorOf.set(c.hash, FALLBACK_COLOR) })
  return colorOf
}

export function relTime(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const diff = Date.now() - d.getTime()
  const abs = Math.abs(diff)
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
  const units = [
    [31_536_000_000, 'year'], [2_592_000_000, 'month'], [86_400_000, 'day'],
    [3_600_000, 'hour'], [60_000, 'minute'], [1_000, 'second'],
  ]
  for (const [ms, unit] of units) {
    if (abs >= ms) return rtf.format(Math.round(-diff / ms), unit)
  }
  return 'just now'
}

export function fmtDate(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function refsHtml(refs) {
  if (!Array.isArray(refs) || refs.length === 0) return ''
  return refs.map(r => {
    if (r === 'HEAD') return '<span class="gg-ref gg-ref-head" data-kind="head">HEAD</span>'
    if (r.startsWith('HEAD ->')) {
      const branch = r.slice('HEAD ->'.length).trim()
      const head = '<span class="gg-ref gg-ref-head" data-kind="head">HEAD</span>'
      const b = branch ? `<span class="gg-ref gg-ref-current" data-kind="branch" data-ref="${esc(branch)}">${esc(branch)}</span>` : ''
      return head + b
    }
    if (r.startsWith('tag: ')) return `<span class="gg-ref gg-ref-tag" data-kind="tag" data-ref="${esc(r.slice(5))}">${esc(r.slice(5))}</span>`
    if (r.includes('/')) return `<span class="gg-ref gg-ref-remote" data-kind="remote" data-ref="${esc(r)}">${esc(r)}</span>`
    return `<span class="gg-ref gg-ref-branch" data-kind="branch" data-ref="${esc(r)}">${esc(r)}</span>`
  }).join('')
}

/** Highlight `backtick-quoted` spans in free text (returns escaped HTML). */
export function inlineCodeHtml(text) {
  return String(text).split(/(`[^`]+`)/g).map(part => {
    if (part.length >= 2 && part.startsWith('`') && part.endsWith('`')) {
      return '<code class="gg-inline-code">' + esc(part.slice(1, -1)) + '</code>'
    }
    return esc(part)
  }).join('')
}

/** Classify one unified-diff line for syntax highlighting. */
export function diffLineClass(line) {
  if (line.startsWith('diff --git')) return 'dl-file'
  if (line.startsWith('index ')) return 'dl-meta'
  if (line.startsWith('---')) return 'dl-file'
  if (line.startsWith('+++')) return 'dl-file'
  if (line.startsWith('@@')) return 'dl-hunk'
  if (line.startsWith('+')) return 'dl-add'
  if (line.startsWith('-')) return 'dl-del'
  if (line.startsWith('\\')) return 'dl-meta'
  return 'dl-ctx'
}

/** Render a unified diff as per-line `<div>` elements with highlighting. */
export function diffHtml(diff) {
  return String(diff).replace(/\n+$/, '').split('\n').map(line => {
    const content = line.length > 0 ? esc(line) : '&nbsp;'
    return '<div class="dl ' + diffLineClass(line) + '">' + content + '</div>'
  }).join('')
}

/** Assign each commit a lane column (newest-first topo order). */
export function layout(commits) {
  const column = new Map()
  const rowOf = new Map()
  const tips = []
  commits.forEach((c, i) => {
    rowOf.set(c.hash, i)
    let col = tips.indexOf(c.hash)
    if (col === -1) {
      col = tips.length
      tips.push(c.hash)
    }
    column.set(c.hash, col)
    c.parents.forEach((p, pi) => {
      if (pi === 0) {
        tips[col] = p
      } else {
        let pcol = tips.indexOf(p)
        if (pcol === -1) {
          pcol = tips.length
          tips.push(p)
        }
        tips[pcol] = p
      }
    })
  })
  let maxCol = 0
  const rows = commits.map(c => {
    const col = column.get(c.hash) ?? 0
    if (col > maxCol) maxCol = col
    return {
      ...c,
      col,
      parentCols: c.parents.map(p => column.get(p) ?? col),
    }
  })
  return { rows, maxCol, rowOf }
}

/**
 * Compute, for every row, which columns carry a vertical lane line in the
 * top half / bottom half of that row (Map: column → color), plus the elbows
 * (split/merge rounded corners) per row.
 */
export function computeLanes(rows, rowOf, colorOf) {
  const n = rows.length
  const top = Array.from({ length: n }, () => new Map())
  const bottom = Array.from({ length: n }, () => new Map())
  const elbows = Array.from({ length: n }, () => [])
  rows.forEach((c, i) => {
    c.parents.forEach((p, pi) => {
      const rp = rowOf.get(p)
      if (rp === undefined) return
      const pc = c.parentCols[pi]
      if (pc === c.col) {
        // first parent, same column: straight lane down
        const color = colorOf.get(c.hash) ?? FALLBACK_COLOR
        bottom[i].set(pc, color)
        for (let r = i + 1; r < rp; r++) { top[r].set(pc, color); bottom[r].set(pc, color) }
        top[rp].set(pc, color)
      } else if (pi === 0) {
        // split: child lane continues UP from the parent. Vertical in the
        // child's column; the horizontal elbow sits in the PARENT's row and
        // turns right-then-up toward the child.
        const color = colorOf.get(c.hash) ?? FALLBACK_COLOR
        bottom[i].set(c.col, color)
        for (let r = i + 1; r < rp; r++) { top[r].set(c.col, color); bottom[r].set(c.col, color) }
        elbows[rp].push({ x1: pc, x2: c.col, color, up: true })
      } else {
        // merge: vertical continues down the merged parent's column; the
        // horizontal elbow sits in THIS row and turns right-then-down.
        const color = colorOf.get(p) ?? FALLBACK_COLOR
        for (let r = i + 1; r < rp; r++) { top[r].set(pc, color); bottom[r].set(pc, color) }
        top[rp].set(pc, color)
        elbows[i].push({ x1: c.col, x2: pc, color, up: false })
      }
    })
  })
  return { top, bottom, elbows }
}

/** One row's elbow: horizontal at the node's level, then rounded corner up or down. */
export function elbowSlice(x1, x2, color, up) {
  const dir = x2 > x1 ? 1 : -1
  const y = ROW_H / 2
  const r = Math.max(2, Math.min(CORNER_R, Math.abs(x2 - x1) / 2))
  const endY = up ? 0 : ROW_H
  const qY = up ? y - r : y + r
  return `<path d="M ${x1 + dir * NODE_R} ${y} L ${x2 - dir * r} ${y} Q ${x2} ${y} ${x2} ${qY} L ${x2} ${endY}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round"/>`
}

/** The graph slice (lane lines + node + elbows) for one commit row. */
export function rowSlice(c, i, lanes, colorOf, maxCol, dirtyLink = null) {
  const w = (maxCol + 1) * COL_W + PAD_X * 2
  const cx = col => PAD_X + col * COL_W + COL_W / 2
  const parts = [`<svg class="gg-slice" width="${w}" height="${ROW_H}" viewBox="0 0 ${w} ${ROW_H}" style="position:static;width:${w}px;height:${ROW_H}px;display:block;flex:none;fill:none;stroke:none">`]
  if (dirtyLink) {
    parts.push(`<line x1="${cx(c.col)}" y1="0" x2="${cx(c.col)}" y2="${ROW_H / 2}" stroke="${dirtyLink}" stroke-width="2" stroke-dasharray="4 3" stroke-linecap="round" opacity="0.5"/>`)
  }
  for (let col = 0; col <= maxCol; col++) {
    const tc = lanes.top[i].get(col)
    const bc = lanes.bottom[i].get(col)
    if (tc) parts.push(`<line x1="${cx(col)}" y1="0" x2="${cx(col)}" y2="${ROW_H / 2}" stroke="${tc}" stroke-width="2" stroke-linecap="round"/>`)
    if (bc) parts.push(`<line x1="${cx(col)}" y1="${ROW_H / 2}" x2="${cx(col)}" y2="${ROW_H}" stroke="${bc}" stroke-width="2" stroke-linecap="round"/>`)
  }
  for (const el of lanes.elbows[i]) {
    parts.push(elbowSlice(cx(el.x1), cx(el.x2), el.color, el.up))
  }
  parts.push(`<circle cx="${cx(c.col)}" cy="${ROW_H / 2}" r="${NODE_R}" fill="${colorOf.get(c.hash) ?? FALLBACK_COLOR}" stroke="rgba(0,0,0,.35)" stroke-width="1"/>`)
  parts.push('</svg>')
  return parts.join('')
}

/** Top-of-graph "uncommitted changes" row: a dashed node + dashed link down to the first commit. */
export function dirtyRowHtml(maxCol, firstCol, dirtyCount, color) {
  const w = (maxCol + 1) * COL_W + PAD_X * 2
  const cx = PAD_X + firstCol * COL_W + COL_W / 2
  const svg =
    `<svg class="gg-slice" width="${w}" height="${ROW_H}" viewBox="0 0 ${w} ${ROW_H}" style="position:static;width:${w}px;height:${ROW_H}px;display:block;flex:none;fill:none;stroke:none">` +
    `<line x1="${cx}" y1="${ROW_H / 2}" x2="${cx}" y2="${ROW_H}" stroke="${color}" stroke-width="2" stroke-dasharray="4 3" stroke-linecap="round" opacity="0.5"/>` +
    `<circle cx="${cx}" cy="${ROW_H / 2}" r="${NODE_R}" fill="${color}" opacity="0.5"/>` +
    `</svg>`
  return (
    `<div class="gg-row gg-row-dirty" style="height:${ROW_H}px">` +
    svg +
    `<span class="gg-subject">未提交的更改</span>` +
    `<span class="gg-meta">${dirtyCount} 个文件</span>` +
    `</div>`
  )
}

/** Full graph markup: one `.gg-row` per commit, each embedding its graph slice + text. */
export function graphHtml(rows, maxCol, rowOf, colorOf, selectedHash, dirty = 0) {
  const lanes = computeLanes(rows, rowOf, colorOf)
  const dirtyColor = dirty > 0 && rows.length > 0 ? (colorOf.get(rows[0].hash) ?? FALLBACK_COLOR) : null
  const head = dirtyColor ? dirtyRowHtml(maxCol, rows[0].col, dirty, dirtyColor) : ''
  return head + rows.map((c, i) => {
    const refs = refsHtml(c.refs)
    const meta = [c.short ?? c.hash, c.author, relTime(c.date)].filter(Boolean).join(' · ')
    const sel = c.hash === selectedHash ? ' sel' : ''
    const link = i === 0 && dirtyColor ? dirtyColor : null
    return (
      `<div class="gg-row${sel}" data-hash="${esc(c.hash)}" style="height:${ROW_H}px">` +
      rowSlice(c, i, lanes, colorOf, maxCol, link) +
      refs +
      `<span class="gg-subject">${esc(c.subject || '(no subject)')}</span>` +
      `<span class="gg-meta">${esc(meta)}</span>` +
      `</div>`
    )
  }).join('')
}
