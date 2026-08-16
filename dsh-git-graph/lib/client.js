// Client half of dsh-git-graph.
// Renders the commit DAG as an SVG "lane" graph (like VS Code Git Graph) next
// to a clickable commit list, with a detail pane showing message / files /
// diff. The panel opens either as a tab in dsh-better-sidebar (when present)
// or as a floating overlay toggled from the sidebar footer.

window.__ModuleLoader__.load({
  id: 'dsh-git-graph',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const React = require('react')
    const { createElement: h, useState, useEffect, useCallback, useRef, useMemo, Fragment } = React

    // ── 样式 ────────────────────────────────────────────────────────────────

    const CSS = [
      '.gg-panel{display:flex;flex-direction:column;height:100%;min-height:0;background:var(--dsw-alias-bg-base,#0f1115);color:var(--dsw-alias-label-primary,#e6e6e6);font-family:var(--dsh-font-ui,-apple-system,"PingFang SC","Segoe UI",sans-serif);font-size:13px}',
      '.gg-toolbar{display:flex;gap:8px;align-items:center;padding:8px 10px;border-bottom:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.08));flex:none;flex-wrap:wrap}',
      '.gg-toolbar .gg-title{font-weight:600;margin-right:4px;display:flex;align-items:center;gap:6px}',
      '.gg-input{font:inherit;font-size:12px;color:var(--dsw-alias-label-primary,#e6e6e6);background:var(--dsw-alias-bg-layer-1,#1a1d24);border:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.1));border-radius:6px;padding:4px 8px;outline:none;min-width:0}',
      '.gg-input:focus{border-color:var(--dsw-alias-state-business-primary,#4c8dff)}',
      '.gg-input.gg-path{flex:1 1 220px}',
      '.gg-input.gg-count{width:64px}',
      '.gg-btn{font:inherit;font-size:12px;color:var(--dsw-alias-label-primary,#e6e6e6);background:var(--dsw-alias-button-elevated-fill,#262a33);border:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.1));border-radius:6px;padding:4px 10px;cursor:pointer;white-space:nowrap}',
      '.gg-btn:hover{background:color-mix(in srgb,var(--dsw-alias-label-primary,#e6e6e6) 8%,transparent)}',
      '.gg-btn.primary{background:var(--dsw-alias-state-business-primary,#4c8dff);border-color:transparent;color:#fff}',
      '.gg-body{flex:1;display:flex;min-height:0}',
      '.gg-graph-col{flex:1;display:flex;min-width:0;min-height:0;overflow:auto;border-right:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.08))}',
      '.gg-detail{flex:1 1 40%;min-width:280px;max-width:46%;display:flex;flex-direction:column;min-height:0;overflow:auto;padding:12px 14px}',
      '.gg-graph-scroll{display:flex;min-width:max-content;min-height:100%}',
      '.gg-svg{flex:none;display:block;position:static;width:auto;height:auto}',
      '.gg-panel svg,.gg-overlay svg,.gg-toggle svg{position:static;width:auto;height:auto;flex:none}',
      '.gg-rows{flex:none;display:flex;flex-direction:column}',
      '.gg-row{display:flex;align-items:center;gap:6px;padding:0 10px 0 4px;cursor:pointer;white-space:nowrap;box-sizing:border-box;border-left:2px solid transparent;line-height:1;flex:none;overflow:hidden}',
      '.gg-row:hover{background:color-mix(in srgb,var(--dsw-alias-label-primary,#e6e6e6) 5%,transparent)}',
      '.gg-row.sel{background:color-mix(in srgb,var(--dsw-alias-state-business-primary,#4c8dff) 14%,transparent);border-left-color:var(--dsw-alias-state-business-primary,#4c8dff)}',
      '.gg-hash{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;color:var(--dsw-alias-label-tertiary,#8b94a7)}',
      '.gg-subject{overflow:hidden;text-overflow:ellipsis;color:var(--dsw-alias-label-primary,#e6e6e6)}',
      '.gg-meta{font-size:11px;color:var(--dsw-alias-label-tertiary,#8b94a7);flex:none}',
      '.gg-ref{display:inline-block;font-size:10px;line-height:16px;padding:0 6px;border-radius:8px;margin-right:4px;font-weight:600;vertical-align:middle}',
      '.gg-ref-head{background:#e5484d;color:#fff}',
      '.gg-ref-branch{background:color-mix(in srgb,var(--dsw-alias-state-success-primary,#3fb950) 22%,transparent);color:var(--dsw-alias-state-success-primary,#3fb950)}',
      '.gg-ref-tag{background:color-mix(in srgb,#e3b341 22%,transparent);color:#e3b341}',
      '.gg-ref-remote{background:color-mix(in srgb,#79b8ff 18%,transparent);color:#79b8ff}',
      '.gg-status{flex:1;display:flex;align-items:center;justify-content:center;padding:24px;color:var(--dsw-alias-label-tertiary,#8b94a7);gap:8px;flex-wrap:wrap}',
      '.gg-status.err{color:var(--dsw-alias-state-error-primary,#f85149)}',
      '.gg-detail h3{margin:0 0 2px;font-size:14px;line-height:20px;font-weight:600;word-break:break-word}',
      '.gg-detail .gg-d-meta{font-size:12px;color:var(--dsw-alias-label-tertiary,#8b94a7);margin:2px 0 8px}',
      '.gg-d-body{white-space:pre-wrap;font-size:12.5px;line-height:18px;color:var(--dsw-alias-label-secondary,#c9d1d9);margin:0 0 12px}',
      '.gg-d-files{margin:0 0 12px}',
      '.gg-d-files h4,.gg-d-diff h4{margin:0 0 4px;font-size:12px;color:var(--dsw-alias-label-secondary,#c9d1d9)}',
      '.gg-file{display:flex;gap:6px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary,#c9d1d9)}',
      '.gg-file .st{flex:none;width:26px;text-align:center;border-radius:3px;font-size:10px;line-height:16px;font-weight:700}',
      '.gg-file .st.A{background:rgba(46,160,67,.2);color:#3fb950}',
      '.gg-file .st.D{background:rgba(248,81,73,.2);color:#f85149}',
      '.gg-file .st.M,.gg-file .st.R{background:rgba(210,153,34,.18);color:#e3b341}',
      '.gg-diff{background:var(--dsw-alias-bg-layer-1,#1a1d24);border:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.08));border-radius:8px;padding:8px 10px;overflow:auto;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11.5px;line-height:16px;white-space:pre;color:var(--dsw-alias-label-secondary,#c9d1d9);max-height:420px}',
      '.gg-empty{color:var(--dsw-alias-label-tertiary,#8b94a7);padding:12px 2px}',
      // footer toggle button
      '.gg-toggle{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:8px;border:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.1));background:transparent;color:var(--dsw-alias-label-secondary,#c9d1d9);cursor:pointer}',
      '.gg-toggle:hover{background:color-mix(in srgb,var(--dsw-alias-label-primary,#e6e6e6) 8%,transparent);color:var(--dsw-alias-label-primary,#e6e6e6)}',
      // floating overlay
      '.gg-overlay{position:fixed;inset:0;z-index:2147483000;background:rgba(0,0,0,.5);display:flex;align-items:stretch;justify-content:flex-end}',
      '.gg-overlay-panel{width:min(920px,94vw);height:100%;background:var(--dsw-alias-bg-base,#0f1115);box-shadow:-20px 0 60px rgba(0,0,0,.5);display:flex;flex-direction:column}',
      '.gg-overlay-head{display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.08));flex:none}',
      '.gg-overlay-head .gg-title{font-weight:600}',
      '.gg-close{margin-left:auto;font:inherit;font-size:16px;line-height:1;color:var(--dsw-alias-label-secondary,#c9d1d9);background:transparent;border:none;cursor:pointer;padding:4px 8px;border-radius:6px}',
      '.gg-close:hover{background:color-mix(in srgb,var(--dsw-alias-label-primary,#e6e6e6) 8%,transparent)}',
    ].join('\n')

    if (typeof document !== 'undefined' && !document.querySelector('style[data-plugin-css="dsh-git-graph"]')) {
      const tag = document.createElement('style')
      tag.dataset.plugin = 'dsh-git-graph'
      tag.dataset.pluginCss = 'dsh-git-graph'
      tag.textContent = CSS
      document.head.appendChild(tag)
    }

    // ── 常量与工具 ──────────────────────────────────────────────────────────

    const ROW_H = 32
    const COL_W = 16
    const NODE_R = 4.5
    const CORNER_R = 5
    const PAD_X = 6
    // Branch colors (assigned per branch name, high-distinction palette).
    const BRANCH_COLORS = [
      '#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#a855f7',
      '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#14b8a6',
    ]
    const FALLBACK_COLOR = '#8b94a7'

    function esc(s) {
      return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    }

    /** Branch names referenced by a commit's `%D` refs (tags and bare HEAD skipped). */
    function branchNames(refs) {
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
    function branchRank(name) {
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
    function branchColors(rows) {
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

    async function api(method, payload) {
      const res = await fetch(`/gitgraph/api/${method}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const parsed = await res.json().catch(() => null)
      if (!res.ok || parsed === null || parsed.ok !== true || parsed.value === undefined) {
        throw new Error(parsed?.error?.message ?? `HTTP ${res.status}`)
      }
      return parsed.value
    }

    function relTime(iso) {
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

    function fmtDate(iso) {
      const d = new Date(iso)
      if (Number.isNaN(d.getTime())) return iso
      return d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    }

    function refsHtml(refs) {
      if (!Array.isArray(refs) || refs.length === 0) return ''
      return refs.map(r => {
        if (r === 'HEAD') return '<span class="gg-ref gg-ref-head">HEAD</span>'
        if (r.startsWith('HEAD ->')) {
          const branch = r.slice('HEAD ->'.length).trim()
          const head = '<span class="gg-ref gg-ref-head">HEAD</span>'
          const b = branch ? `<span class="gg-ref gg-ref-branch">${esc(branch)}</span>` : ''
          return head + b
        }
        if (r.startsWith('tag: ')) return `<span class="gg-ref gg-ref-tag">${esc(r.slice(5))}</span>`
        if (r.includes('/')) return `<span class="gg-ref gg-ref-remote">${esc(r)}</span>`
        return `<span class="gg-ref gg-ref-branch">${esc(r)}</span>`
      }).join('')
    }

    // ── 图布局(列/泳道分配) ────────────────────────────────────────────────

    function layout(commits) {
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
     * Rounded-rectangle corner elbow from a commit node (x1,y1) down to a
     * parent node (x2,y2) in a different lane: vertical → rounded corner →
     * horizontal → rounded corner → vertical. `y2` is always below `y1`.
     */
    function elbowPath(x1, y1, x2, y2) {
      const dir = x2 > x1 ? 1 : -1
      const ymid = y1 + ROW_H / 2
      const r = Math.max(2, Math.min(CORNER_R, Math.abs(x2 - x1) / 2, (y2 - y1) / 3))
      return [
        `M ${x1} ${y1}`,
        `L ${x1} ${ymid - r}`,
        `Q ${x1} ${ymid} ${x1 + dir * r} ${ymid}`,
        `L ${x2 - dir * r} ${ymid}`,
        `Q ${x2} ${ymid} ${x2} ${ymid + r}`,
        `L ${x2} ${y2 - NODE_R}`,
      ].join(' ')
    }

    function buildSvg(rows, maxCol, rowOf, colorOf) {
      const width = (maxCol + 1) * COL_W + PAD_X * 2
      const height = rows.length * ROW_H
      const cx = col => PAD_X + col * COL_W + COL_W / 2
      const cy = i => i * ROW_H + ROW_H / 2
      const parts = [`<svg class="gg-svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="position:static;width:${width}px;height:${height}px;display:block;flex:none;fill:none;stroke:none">`]

      // edges (drawn first, under nodes)
      rows.forEach((c, i) => {
        const x = cx(c.col)
        const y = cy(i)
        c.parents.forEach((p, pi) => {
          const pr = rowOf.get(p)
          if (pr === undefined) return
          const pc = c.parentCols[pi]
          const px = cx(pc)
          const py = cy(pr)
          // First parent follows the commit's branch; merge parents take the
          // merged-in branch's color.
          const color = pi === 0
            ? (colorOf.get(c.hash) ?? FALLBACK_COLOR)
            : (colorOf.get(p) ?? FALLBACK_COLOR)
          if (pc === c.col) {
            parts.push(`<line x1="${x}" y1="${y + NODE_R}" x2="${px}" y2="${py - NODE_R}" stroke="${color}" stroke-width="2" stroke-linecap="round"/>`)
          } else {
            parts.push(`<path d="${elbowPath(x, y, px, py)}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`)
          }
        })
      })

      // nodes
      rows.forEach((c, i) => {
        const x = cx(c.col)
        const y = cy(i)
        const color = colorOf.get(c.hash) ?? FALLBACK_COLOR
        parts.push(`<circle cx="${x}" cy="${y}" r="${NODE_R}" fill="${color}" stroke="rgba(0,0,0,.35)" stroke-width="1"/>`)
      })

      parts.push('</svg>')
      return parts.join('')
    }

    function rowsHtml(rows, selectedHash) {
      return rows.map(c => {
        const refs = refsHtml(c.refs)
        const meta = [c.short, c.author, relTime(c.date)].filter(Boolean).join(' · ')
        const sel = c.hash === selectedHash ? ' sel' : ''
        return (
          `<div class="gg-row${sel}" data-hash="${esc(c.hash)}" style="height:${ROW_H}px">` +
          refs +
          `<span class="gg-subject">${esc(c.subject || '(no subject)')}</span>` +
          `<span class="gg-meta">${esc(meta)}</span>` +
          `</div>`
        )
      }).join('')
    }

    // ── 主面板组件 ──────────────────────────────────────────────────────────

    function GitGraphPanel(props) {
      const { sessionId, initialCwd } = props
      const [state, setState] = useState({ status: 'loading', data: null, error: null })
      const [path, setPath] = useState(initialCwd || '')
      const [maxCount, setMaxCount] = useState(300)
      const [selected, setSelected] = useState(null)
      const [detail, setDetail] = useState({ status: 'idle', data: null, error: null })
      const scrollRef = useRef(null)
      const maxCountRef = useRef(maxCount)
      useEffect(() => { maxCountRef.current = maxCount }, [maxCount])

      const load = useCallback(async (targetPath) => {
        setState(s => ({ ...s, status: 'loading', error: null }))
        try {
          const data = await api('graph', { sessionId, cwd: targetPath || undefined, maxCount: maxCountRef.current })
          setState({ status: 'ready', data, error: null })
          if (data && data.root) setPath(data.root)
          setSelected(null)
          setDetail({ status: 'idle', data: null, error: null })
        } catch (error) {
          setState({ status: 'error', data: null, error: error?.message ?? String(error) })
        }
      }, [sessionId])

      useEffect(() => {
        load(initialCwd)
      }, [load, initialCwd])

      const openCommit = useCallback(async (hash) => {
        setSelected(hash)
        setDetail({ status: 'loading', data: null, error: null })
        try {
          const d = await api('commit', { sessionId, cwd: path || undefined, hash })
          setDetail({ status: 'ready', data: d, error: null })
        } catch (error) {
          setDetail({ status: 'error', data: null, error: error?.message ?? String(error) })
        }
      }, [sessionId, path])

      const onRowClick = (e) => {
        const row = e.target.closest('.gg-row')
        if (row) openCommit(row.dataset.hash)
      }

      const layoutData = useMemo(() => {
        const commits = state.data?.commits ?? []
        return layout(commits)
      }, [state.data])

      const svg = useMemo(() => {
        if (!state.data || state.data.commits.length === 0) return null
        const colorOf = branchColors(layoutData.rows)
        return buildSvg(layoutData.rows, layoutData.maxCol, layoutData.rowOf, colorOf)
      }, [layoutData, state.data])

      const rowsMarkup = useMemo(() => rowsHtml(layoutData.rows, selected), [layoutData.rows, selected])

      return h('div', { className: 'gg-panel' },
        h('div', { className: 'gg-toolbar' },
          h('span', { className: 'gg-title', dangerouslySetInnerHTML: { __html: '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M11.5 1a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3ZM2 2h6v1.5H2V2Zm9.5 4.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3ZM8 6.5H2V8h6V6.5Zm3.5 4.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3ZM10 11H2v1.5h8V11Z"/></svg>' } }),
          h('span', null, 'Git Graph'),
          h('input', {
            className: 'gg-input gg-path', value: path, spellCheck: false,
            placeholder: 'repository path',
            onChange: e => setPath(e.target.value),
            onKeyDown: e => { if (e.key === 'Enter') load(path) },
          }),
          h('input', {
            className: 'gg-input gg-count', type: 'number', value: maxCount,
            min: 10, max: 2000, step: 100,
            onChange: e => setMaxCount(Math.min(2000, Math.max(10, Number(e.target.value) || 300))),
          }),
          h('button', { className: 'gg-btn primary', onClick: () => load(path) }, 'Refresh'),
        ),
        h('div', { className: 'gg-body' },
          h('div', { className: 'gg-graph-col' },
            state.status === 'loading' && h('div', { className: 'gg-status' }, 'Loading commit graph…'),
            state.status === 'error' && h('div', { className: 'gg-status err' }, 'Error: ' + state.error),
            state.status === 'ready' && state.data && !state.data.isRepo && h('div', { className: 'gg-status' }, 'Not a git repository. Enter a repository path above.'),
            state.status === 'ready' && state.data && state.data.isRepo && state.data.commits.length === 0 && h('div', { className: 'gg-status' }, 'No commits yet.'),
            state.status === 'ready' && state.data && state.data.isRepo && state.data.commits.length > 0 && h('div', {
              className: 'gg-graph-scroll',
              ref: scrollRef,
              onClick: onRowClick,
              dangerouslySetInnerHTML: { __html: (svg ?? '') + '<div class="gg-rows">' + rowsMarkup + '</div>' },
            }),
          ),
          h('div', { className: 'gg-detail' },
            selected === null && h('div', { className: 'gg-empty' }, 'Select a commit to see its message, changed files, and diff.'),
            selected !== null && detail.status === 'loading' && h('div', { className: 'gg-status' }, 'Loading commit…'),
            selected !== null && detail.status === 'error' && h('div', { className: 'gg-status err' }, 'Error: ' + detail.error),
            selected !== null && detail.status === 'ready' && detail.data && h(Fragment, null,
              h('div', { dangerouslySetInnerHTML: { __html: '<h3>' + esc(detail.data.subject || '(no subject)') + '</h3>' } }),
              h('div', { className: 'gg-d-meta' },
                h('span', null, esc(detail.data.short) + ' · ' + esc(detail.data.author)),
                h('span', null, ' · ' + esc(fmtDate(detail.data.authorDate))),
                h('div', { dangerouslySetInnerHTML: { __html: refsHtml(detail.data.refs) } }),
              ),
              detail.data.body ? h('pre', { className: 'gg-d-body' }, detail.data.body) : null,
              h('div', { className: 'gg-d-files' },
                h('h4', null, `Changed files (${detail.data.files.length})`),
                h('div', null, detail.data.files.map(f =>
                  h('div', { className: 'gg-file', key: f.path },
                    h('span', { className: 'st ' + f.status.charAt(0) }, f.status.charAt(0)),
                    h('span', null, esc(f.path)),
                  ),
                )),
              ),
              detail.data.stats ? h('div', { className: 'gg-d-meta' }, esc(detail.data.stats)) : null,
              h('div', { className: 'gg-d-diff' },
                h('h4', null, 'Diff'),
                detail.data.diff ? h('pre', { className: 'gg-diff' }, detail.data.diff) : h('div', { className: 'gg-empty' }, 'No diff available.'),
              ),
            ),
          ),
        ),
      )
    }

    // ── 浮动覆盖层 ──────────────────────────────────────────────────────────

    let overlayRoot = null
    let overlayCleanup = null
    let appCtx = null

    function openOverlay(ctx) {
      const list = ctx.sessions.list.getSnapshot()
      const sessionId = list.current
      const cwd = sessionId ? list.byId?.[sessionId]?.cwd : undefined
      if (overlayRoot) closeOverlay()
      const host = document.createElement('div')
      host.className = 'gg-overlay-host'
      document.body.appendChild(host)
      const reactDom = require('react-dom/client')
      const root = reactDom.createRoot(host)
      overlayRoot = { host, root }
      const close = () => closeOverlay()
      root.render(
        h('div', { className: 'gg-overlay', onClick: e => { if (e.target === e.currentTarget) close() } },
          h('div', { className: 'gg-overlay-panel' },
            h('div', { className: 'gg-overlay-head' },
              h('span', { className: 'gg-title' }, 'Git Graph'),
              h('button', { className: 'gg-close', onClick: close }, '×'),
            ),
            h(GitGraphPanel, { sessionId, initialCwd: cwd }),
          ),
        ),
      )
      overlayCleanup = () => { root.unmount(); host.remove(); overlayRoot = null; overlayCleanup = null }
    }

    function closeOverlay() {
      if (overlayCleanup) overlayCleanup()
    }

    function ToggleButton() {
      const onClick = () => {
        if (overlayRoot) closeOverlay()
        else if (appCtx) openOverlay(appCtx)
      }
      return h('button', {
        className: 'gg-toggle', title: 'Git Graph', 'aria-label': 'Git Graph', onClick,
        dangerouslySetInnerHTML: { __html: '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M11.5 1a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3ZM2 2h6v1.5H2V2Zm9.5 4.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3ZM8 6.5H2V8h6V6.5Zm3.5 4.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3ZM10 11H2v1.5h8V11Z"/></svg>' },
      })
    }

    // ── 插件主体 ────────────────────────────────────────────────────────────

    const inject = ['slots', 'sessions']

    function apply(ctx) {
      appCtx = ctx

      // 1) better-sidebar tab (best-effort; sidebar provides the chrome).
      // better-sidebar's client may load after this plugin, so register both
      // immediately (already available) AND deferred via ctx.inject (arrives
      // later). A flag guards against double registration.
      let tabRegistered = false
      const registerTab = (betterSidebar) => {
        if (tabRegistered) return
        if (!betterSidebar || typeof betterSidebar.registerTab !== 'function') return
        tabRegistered = true
        const dispose = betterSidebar.registerTab({
          id: 'git-graph',
          title: 'Git Graph',
          single: true,
          order: 60,
          component: (props) => h(GitGraphPanel, {
            sessionId: props.scope?.sessionId,
            initialCwd: props.scope?.cwd,
          }),
        })
        ctx.effect(() => dispose, 'dsh-git-graph: better-sidebar tab')
      }

      try {
        registerTab(ctx.get('betterSidebar'))
      } catch (error) {
        console.warn('[dsh-git-graph] better-sidebar tab lookup failed:', error)
      }

      try {
        if (typeof ctx.inject === 'function') {
          ctx.inject(['betterSidebar'], (sctx) => { registerTab(sctx.betterSidebar) })
        }
      } catch (error) {
        console.warn('[dsh-git-graph] better-sidebar deferred registration failed:', error)
      }

      // 2) footer toggle (always available, opens the floating overlay)
      try {
        const slots = ctx.slots
        if (slots && typeof slots.inject === 'function') {
          slots.inject('sidebar.footer.action', () => {
            const dispose = slots.register(
              { name: 'sidebar.footer.action', id: 'dsh-git-graph', order: 20, inject: () => ({}) },
              ToggleButton,
            )
            return () => dispose()
          })
        }
      } catch (error) {
        console.warn('[dsh-git-graph] footer toggle registration failed:', error)
      }
    }

    exports.apply = apply
    exports.inject = inject
    return module.exports
  },
})
