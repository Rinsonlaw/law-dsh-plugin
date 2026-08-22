// Host half of dsh-git-graph.
// Registers /gitgraph/api HTTP routes that run `git` against the session's
// working directory and return the commit DAG / commit detail as JSON.
// The client half (lib/client.js) fetches these routes.

import {
  getGraph, getCommit, getStatus,
  checkout, createBranch, renameBranch, deleteBranch, merge,
  createTag, deleteTag, cherryPick, revert, reset, deleteRemoteBranch,
  currentBranch, GitError,
} from './git.js'

export const name = 'git-graph'
export const inject = ['webServer', 'sessions', 'webRuntime']

/** Whether a hostname is loopback (the default DSH web bind). */
function isLoopback(hostname) {
  return hostname === 'localhost'
    || hostname === '::1'
    || hostname === '127.0.0.1'
    || /^127\./.test(hostname)
}

/**
 * CSRF fence: reject cross-site requests and any Host that is neither
 * loopback nor one of the deployment's `--trusted-host` authorities.
 */
function isTrustedRequest(req, trustedHosts) {
  const hostHeader = req.headers.host
  if (!hostHeader) return false
  if (req.headers['sec-fetch-site'] === 'cross-site') return false
  const hostname = hostHeader.replace(/^\[/, '').replace(/\].*$/, '').split(':')[0]
  if (isLoopback(hostname)) return true
  const authorities = Array.isArray(trustedHosts) ? trustedHosts : []
  return authorities.some(entry => {
    try {
      const h = String(entry).includes('://')
        ? new URL(entry).hostname
        : String(entry).replace(/^\[/, '').replace(/\].*$/, '').split(':')[0]
      return h === hostname
    } catch {
      return false
    }
  })
}

function writeJson(res, status, body) {
  const payload = JSON.stringify(body)
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(payload)
}

function writeOk(res, value) {
  writeJson(res, 200, { ok: true, value })
}

function writeError(res, error) {
  const status = error instanceof GitError ? 400 : 500
  writeJson(res, status, {
    ok: false,
    error: { code: error?.code ?? 'internal', message: error?.message ?? String(error) },
  })
}

function badRequest(message) {
  return { ok: false, error: { code: 'bad-request', message } }
}

function requireString(payload, key) {
  return typeof payload[key] === 'string' ? payload[key].trim() : ''
}

/**
 * 执行一个写操作并统一响应：成功返回 `{ success, branch, ...result }`；
 * 冲突（merge/cherry-pick/revert）返回 `{ success:false, conflict:true }`。
 */
async function runMutation(cwd, fn) {
  const result = await fn()
  let branch = null
  try { branch = await currentBranch(cwd) } catch { /* keep null */ }
  const obj = result && typeof result === 'object' ? result : {}
  if (obj.conflict === true) {
    return { success: false, conflict: true, output: obj.output ?? '', branch }
  }
  return { success: true, branch, ...obj }
}

async function readJsonBody(req) {
  const chunks = []
  let total = 0
  for await (const chunk of req) {
    const buffer = Buffer.from(chunk)
    total += buffer.length
    if (total > 1_000_000) {
      const error = new Error('request body too large')
      error.code = 'bad-request'
      throw error
    }
    chunks.push(buffer)
  }
  const text = Buffer.concat(chunks).toString('utf8')
  if (text.trim() === '') return {}
  try {
    return JSON.parse(text)
  } catch {
    const error = new Error('request body is not valid JSON')
    error.code = 'bad-request'
    throw error
  }
}

/** Resolve the repository working directory for a request. */
function sessionCwd(ctx, sessionId, clientCwd) {
  const headerCwd = ctx.sessions?.get?.(sessionId)?.header?.cwd
  if (typeof headerCwd === 'string' && headerCwd !== '') return headerCwd
  if (typeof clientCwd === 'string' && clientCwd !== '') return clientCwd
  return process.cwd()
}

export function apply(ctx) {
  const fence = req => isTrustedRequest(req, ctx.webRuntime?.trustedHosts ?? [])

  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: '/gitgraph/api',
    handler: async (req, res) => {
      if (!fence(req)) {
        writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'forbidden' } })
        return
      }
      if (req.method !== 'POST') {
        writeJson(res, 405, { ok: false, error: { code: 'method-error', message: 'method not allowed' } })
        return
      }
      const pathname = new URL(req.url ?? '/', 'http://dsh.internal').pathname
      const method = pathname.startsWith('/gitgraph/api/') ? pathname.slice('/gitgraph/api/'.length) : ''
      if (method === '' || method.includes('/')) {
        writeJson(res, 404, { ok: false, error: { code: 'not-found', message: 'unknown gitgraph method' } })
        return
      }

      let payload
      try {
        payload = await readJsonBody(req)
      } catch (error) {
        writeError(res, error)
        return
      }

      const sessionId = typeof payload.sessionId === 'string' ? payload.sessionId : ''
      const cwd = sessionCwd(ctx, sessionId, typeof payload.cwd === 'string' ? payload.cwd : '')

      try {
        if (method === 'graph') {
          const maxCount = typeof payload.maxCount === 'number' ? payload.maxCount : 300
          writeOk(res, await getGraph(cwd, maxCount))
          return
        }
        if (method === 'commit') {
          const hash = typeof payload.hash === 'string' ? payload.hash.trim() : ''
          if (hash === '') {
            writeJson(res, 400, { ok: false, error: { code: 'bad-request', message: 'hash is required' } })
            return
          }
          writeOk(res, await getCommit(cwd, hash))
          return
        }
        // ── 写操作 ─────────────────────────────────────────────────────────
        if (method === 'status') { writeOk(res, await getStatus(cwd)); return }
        if (method === 'checkout') {
          const ref = requireString(payload, 'ref')
          if (!ref) { writeJson(res, 400, badRequest('ref is required')); return }
          writeOk(res, await runMutation(cwd, () => checkout(cwd, ref, { detach: payload.detach === true })))
          return
        }
        if (method === 'createBranch') {
          const name = requireString(payload, 'name')
          if (!name) { writeJson(res, 400, badRequest('name is required')); return }
          writeOk(res, await runMutation(cwd, () => createBranch(cwd, name, requireString(payload, 'from') || undefined, { checkout: payload.checkout === true })))
          return
        }
        if (method === 'renameBranch') {
          const oldName = requireString(payload, 'oldName')
          const newName = requireString(payload, 'newName')
          if (!oldName || !newName) { writeJson(res, 400, badRequest('oldName and newName are required')); return }
          writeOk(res, await runMutation(cwd, () => renameBranch(cwd, oldName, newName)))
          return
        }
        if (method === 'deleteBranch') {
          const name = requireString(payload, 'name')
          if (!name) { writeJson(res, 400, badRequest('name is required')); return }
          writeOk(res, await runMutation(cwd, () => deleteBranch(cwd, name, { force: payload.force === true })))
          return
        }
        if (method === 'merge') {
          const ref = requireString(payload, 'ref')
          if (!ref) { writeJson(res, 400, badRequest('ref is required')); return }
          writeOk(res, await runMutation(cwd, () => merge(cwd, ref, { noFf: payload.noFf === true, squash: payload.squash === true })))
          return
        }
        if (method === 'createTag') {
          const name = requireString(payload, 'name')
          if (!name) { writeJson(res, 400, badRequest('name is required')); return }
          writeOk(res, await runMutation(cwd, () => createTag(cwd, name, requireString(payload, 'hash') || undefined)))
          return
        }
        if (method === 'deleteTag') {
          const name = requireString(payload, 'name')
          if (!name) { writeJson(res, 400, badRequest('name is required')); return }
          writeOk(res, await runMutation(cwd, () => deleteTag(cwd, name)))
          return
        }
        if (method === 'cherryPick') {
          const hash = requireString(payload, 'hash')
          if (!hash) { writeJson(res, 400, badRequest('hash is required')); return }
          writeOk(res, await runMutation(cwd, () => cherryPick(cwd, hash)))
          return
        }
        if (method === 'revert') {
          const hash = requireString(payload, 'hash')
          if (!hash) { writeJson(res, 400, badRequest('hash is required')); return }
          writeOk(res, await runMutation(cwd, () => revert(cwd, hash)))
          return
        }
        if (method === 'reset') {
          const hash = requireString(payload, 'hash')
          const mode = requireString(payload, 'mode') || 'mixed'
          if (!hash) { writeJson(res, 400, badRequest('hash is required')); return }
          writeOk(res, await runMutation(cwd, () => reset(cwd, hash, mode)))
          return
        }
        if (method === 'deleteRemoteBranch') {
          const name = requireString(payload, 'name')
          if (!name) { writeJson(res, 400, badRequest('name is required')); return }
          writeOk(res, await runMutation(cwd, () => deleteRemoteBranch(cwd, name, requireString(payload, 'remote') || 'origin')))
          return
        }
        writeJson(res, 404, { ok: false, error: { code: 'not-found', message: 'unknown gitgraph method' } })
      } catch (error) {
        writeError(res, error)
      }
    },
  }), 'dsh-git-graph: /gitgraph/api route')
}
