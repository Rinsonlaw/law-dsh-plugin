// Git backend for dsh-git-graph.
// Everything goes through the system `git` binary spawned per request (no
// library, no state), with NUL-separated porcelain output so parsing never
// depends on locale or color config. All commands run with `-C <cwd>` and
// `--no-pager` / `-c color.ui=false` so output stays machine-readable.

import { spawn } from 'node:child_process'

/**
 * Field separator used INSIDE git format strings: the literal `%x00`, which
 * git expands to a NUL byte in its output. (We cannot pass a real NUL inside a
 * spawn argument — Node rejects it.)
 */
const FMT_SEP = '%x00'

/** The NUL byte, used to split git's returned stdout into fields. */
const NUL = '\x00'

export class GitError extends Error {
  constructor(message, command) {
    super(message)
    this.name = 'GitError'
    this.code = 'git-error'
    this.command = command
  }
}

/** One git log row (graph node). */
export function runGit(cwd, args, { timeoutMs = 30_000, maxBytes = 16 * 1024 * 1024 } = {}) {
  const full = ['-C', cwd, '--no-pager', '-c', 'color.ui=false', '-c', 'core.quotepath=false', ...args]
  return new Promise((resolve, reject) => {
    const child = spawn('git', full, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', LC_ALL: 'C' },
    })
    let stdout = ''
    let stderr = ''
    let tooBig = false
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new GitError(`git ${args[0] ?? ''} timed out after ${timeoutMs}ms`, args.join(' ')))
    }, timeoutMs)
    child.stdout.on('data', chunk => {
      stdout += chunk.toString('utf8')
      if (stdout.length > maxBytes) {
        tooBig = true
        child.kill('SIGKILL')
      }
    })
    child.stderr.on('data', chunk => { stderr += chunk.toString('utf8') })
    child.on('error', error => {
      clearTimeout(timer)
      reject(new GitError(`cannot run git: ${error.message}`, args.join(' ')))
    })
    child.on('close', code => {
      clearTimeout(timer)
      if (tooBig) {
        reject(new GitError('git output too large', args.join(' ')))
        return
      }
      if (code === 0) {
        resolve(stdout)
      } else {
        reject(new GitError(stderr.trim() || `git exited with ${String(code)}`, args.join(' ')))
      }
    })
  })
}

/** Whether the directory is inside a git work tree. */
export async function isGitRepo(cwd) {
  try {
    const out = await runGit(cwd, ['rev-parse', '--is-inside-work-tree'])
    return out.trim() === 'true'
  } catch {
    return false
  }
}

/** Repository top level containing `cwd`. */
export async function repoRoot(cwd) {
  const out = await runGit(cwd, ['rev-parse', '--show-toplevel'])
  return out.trim()
}

/** Current branch name (`HEAD` when detached). */
export async function currentBranch(cwd) {
  const out = await runGit(cwd, ['rev-parse', '--abbrev-ref', 'HEAD'])
  return out.trim()
}

/** Split `%D` decorations (`HEAD -> main, origin/main, tag: v1.0`). */
function parseRefs(decorate) {
  if (!decorate) return []
  return decorate.split(',').map(s => s.trim()).filter(Boolean)
}

/** All branches/tags/remotes with their short name, object, and ref kind. */
export async function getRefs(cwd) {
  // Note: `for-each-ref --format` uses `%00` (two-digit hex) for a NUL byte,
  // unlike `--pretty=format:` which uses `%x00`.
  const raw = await runGit(cwd, [
    'for-each-ref',
    `--format=${['%(refname:short)', '%(objectname)', '%(refname)'].join('%00')}`,
    '--sort=-creatordate',
  ])
  const refs = []
  for (const line of raw.split('\n')) {
    if (!line) continue
    const [name, hash, full] = line.split(NUL)
    if (!full) continue
    const kind = full.startsWith('refs/heads/') ? 'branch'
      : full.startsWith('refs/tags/') ? 'tag'
      : full.startsWith('refs/remotes/') ? 'remote'
      : 'other'
    refs.push({ name, hash, full, kind })
  }
  return refs
}

/**
 * The full commit DAG (newest first, `--topo-order`), capped at `maxCount`.
 * Each commit carries its parents' full hashes so the client can lay out lanes.
 */
export async function getGraph(cwd, maxCount = 300) {
  if (!(await isGitRepo(cwd))) return { isRepo: false }
  const root = await repoRoot(cwd)
  const branch = await currentBranch(root).catch(() => 'HEAD')
  // maxCount <= 0 means "all commits" (no `-n` limit).
  const limit = Math.floor(Number(maxCount) || 0)
  const args = ['log', '--all', '--topo-order', '--date=iso-strict']
  if (limit > 0) args.push('-n', String(Math.min(2000, Math.max(1, limit))))
  args.push(`--pretty=format:${['%H', '%P', '%h', '%s', '%an', '%ae', '%ad', '%D'].join(FMT_SEP)}`)
  const raw = await runGit(root, args)
  const commits = []
  for (const line of raw.split('\n')) {
    if (!line) continue
    const [hash, parents, short, subject, author, authorEmail, date, refs] = line.split(NUL)
    if (!hash) continue
    commits.push({
      hash,
      short: short ?? hash.slice(0, 7),
      parents: parents ? parents.split(' ').filter(Boolean) : [],
      subject: subject ?? '',
      author: author ?? '',
      authorEmail: authorEmail ?? '',
      date: date ?? '',
      refs: parseRefs(refs),
    })
  }
  const refs = await getRefs(root).catch(() => [])
  return { isRepo: true, root, branch, commits, refs }
}

/**
 * Full detail of one commit: metadata, changed files, short stat line, and
 * the patch text (`-m --first-parent` so merge commits always have a diff).
 */
export async function getCommit(cwd, hash) {
  const root = await repoRoot(cwd)
  const metaRaw = await runGit(root, [
    'show', '--no-patch', '--date=iso-strict',
    `--pretty=format:${['%H', '%h', '%P', '%s', '%b', '%an', '%ae', '%ad', '%cn', '%ce', '%cd', '%D'].join(FMT_SEP)}`,
    hash,
  ])
  const [full, short, parents, subject, body, author, authorEmail, authorDate,
    committer, committerEmail, committerDate, refs] = metaRaw.split(NUL)

  const filesRaw = await runGit(root, ['show', '--format=', '--name-status', '--no-renames', hash]).catch(() => '')
  const files = filesRaw.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
    const m = l.match(/^([A-Z]\S*)\t(.*)$/)
    return m ? { status: m[1], path: m[2] } : { status: '?', path: l }
  })

  const statsRaw = await runGit(root, ['show', '--format=', '--stat', '--oneline', hash]).catch(() => '')
  const statLines = statsRaw.split('\n').map(l => l.trim()).filter(Boolean)
  const stats = statLines.length > 0 ? statLines[statLines.length - 1] : ''

  const diff = await runGit(root, ['show', '--format=', '--patch', '--no-color', '--no-ext-diff', '-m', '--first-parent', hash]).catch(() => '')

  return {
    hash: full ?? hash,
    short: short ?? hash.slice(0, 7),
    parents: parents ? parents.split(' ').filter(Boolean) : [],
    subject: subject ?? '',
    body: body ?? '',
    author: author ?? '',
    authorEmail: authorEmail ?? '',
    authorDate: authorDate ?? '',
    committer: committer ?? '',
    committerEmail: committerEmail ?? '',
    committerDate: committerDate ?? '',
    refs: parseRefs(refs),
    files,
    stats,
    diff,
  }
}

// ── 写操作 ────────────────────────────────────────────────────────────────
// 所有 mutation 都走上面的 runGit()（spawn 数组，天然防 shell 注入），并
// 对分支名 / hash / ref 参数做白名单式校验，拒绝选项注入与非法字符。

/** 校验分支名 / tag 名（新建、重命名、删除用）。 */
export function assertValidRef(name, kind = 'ref') {
  if (typeof name !== 'string' || name === '' || name.length > 255) {
    throw new GitError(`invalid ${kind} name`, `validate-${kind}`)
  }
  if (/\s/.test(name) || name.startsWith('-') || name.includes('..')
    || /[~^:?*\[\\]/.test(name) || name.startsWith('/') || name.endsWith('/')
    || name.includes('//') || name.endsWith('.') || name.endsWith('.lock')
    || name === '@' || name.includes('@{')) {
    throw new GitError(`invalid ${kind} name: ${name}`, `validate-${kind}`)
  }
  return name
}

/** 校验 commit hash（7–40 位十六进制）。 */
export function assertValidHash(hash) {
  if (typeof hash !== 'string' || !/^[0-9a-f]{7,40}$/i.test(hash)) {
    throw new GitError(`invalid commit hash: ${String(hash).slice(0, 40)}`, 'validate-hash')
  }
  return hash
}

/** 校验要传给 checkout/merge 等命令的 ref 实参（防 `--option` 注入）。 */
function assertRefArg(ref) {
  if (typeof ref !== 'string' || ref === '' || ref.startsWith('-') || /\s/.test(ref)) {
    throw new GitError(`invalid ref: ${String(ref).slice(0, 60)}`, 'validate-ref')
  }
  return ref
}

const HASH_RE = /^[0-9a-f]{7,40}$/i

/** 工作区状态：当前分支、upstream、ahead/behind、未提交变更文件。 */
export async function getStatus(cwd) {
  const root = await repoRoot(cwd)
  const raw = await runGit(root, ['status', '--porcelain=v1', '-b'])
  const lines = raw.split('\n')
  const header = (lines[0] ?? '').replace(/^##\s*/, '').trim()
  let branch = 'HEAD'
  let detached = false
  let upstream = ''
  let ahead = 0
  let behind = 0
  if (header.startsWith('No commits yet') || header.startsWith('Initial commit')) {
    branch = header.replace(/^(No commits yet on|Initial commit on)\s*/, '')
  } else if (header.startsWith('HEAD')) {
    detached = true
  } else {
    const m = header.match(/^(.+?)(?:\.\.\.([^\s\[]+))?(?:\s+\[(.+)\])?$/)
    if (m) {
      branch = m[1]
      upstream = m[2] ?? ''
      const track = m[3] ?? ''
      const am = track.match(/ahead (\d+)/)
      const bm = track.match(/behind (\d+)/)
      ahead = am ? Number(am[1]) : 0
      behind = bm ? Number(bm[1]) : 0
    } else {
      branch = header
    }
  }
  const files = lines.slice(1).filter(l => l.trim() !== '').map(l => ({ code: l.slice(0, 2), path: l.slice(3) }))
  return { root, branch, detached, upstream, ahead, behind, dirty: files.length, files }
}

/** 是否存在未解决的合并冲突（`UU`/`AA`/`DD` 等 unmerged 状态）。 */
async function hasConflicts(cwd) {
  try {
    const out = await runGit(cwd, ['status', '--porcelain'])
    return /^(UU|AA|DD|AU|UA|DU|UD)/m.test(out)
  } catch {
    return false
  }
}

/** 切换分支 / 提交（hash 自动 detach）。返回切换后的分支名。 */
export async function checkout(cwd, ref, { detach = false } = {}) {
  const root = await repoRoot(cwd)
  const args = ['checkout']
  if (detach || HASH_RE.test(ref)) args.push('--detach')
  args.push(assertRefArg(ref))
  await runGit(root, args)
  return currentBranch(root).catch(() => 'HEAD')
}

/** 新建分支（可选 `checkout` 直接切过去），`from` 可为 hash 或 ref。 */
export async function createBranch(cwd, name, from, { checkout: co = false } = {}) {
  const root = await repoRoot(cwd)
  assertValidRef(name, 'branch')
  const args = co ? ['checkout', '-b', name] : ['branch', name]
  if (from) args.push(HASH_RE.test(from) ? assertValidHash(from) : assertRefArg(from))
  await runGit(root, args)
  return co ? currentBranch(root).catch(() => name) : name
}

/** 重命名分支。 */
export async function renameBranch(cwd, oldName, newName) {
  const root = await repoRoot(cwd)
  assertValidRef(oldName, 'branch')
  assertValidRef(newName, 'branch')
  await runGit(root, ['branch', '-m', oldName, newName])
  return newName
}

/** 删除本地分支（`force` 时 `-D`）。 */
export async function deleteBranch(cwd, name, { force = false } = {}) {
  const root = await repoRoot(cwd)
  assertValidRef(name, 'branch')
  await runGit(root, ['branch', force ? '-D' : '-d', name])
}

/** 合并 ref 到当前分支；冲突时返回 `{ conflict: true }` 而非抛错。 */
export async function merge(cwd, ref, { noFf = false, squash = false } = {}) {
  const root = await repoRoot(cwd)
  assertRefArg(ref)
  const args = ['merge']
  if (noFf) args.push('--no-ff')
  if (squash) args.push('--squash')
  args.push(ref)
  try {
    const out = await runGit(root, args)
    return { conflict: false, output: out.trim() }
  } catch (error) {
    if (await hasConflicts(root)) return { conflict: true, output: error.message }
    throw error
  }
}

/** 打 tag（可指向指定 hash，默认 HEAD）。 */
export async function createTag(cwd, name, hash) {
  const root = await repoRoot(cwd)
  assertValidRef(name, 'tag')
  const args = ['tag', name]
  if (hash) args.push(assertValidHash(hash))
  await runGit(root, args)
}

/** 删除本地 tag。 */
export async function deleteTag(cwd, name) {
  const root = await repoRoot(cwd)
  assertValidRef(name, 'tag')
  await runGit(root, ['tag', '-d', name])
}

/** cherry-pick 一个提交；冲突时返回 `{ conflict: true }`。 */
export async function cherryPick(cwd, hash) {
  const root = await repoRoot(cwd)
  assertValidHash(hash)
  try {
    const out = await runGit(root, ['cherry-pick', hash])
    return { conflict: false, output: out.trim() }
  } catch (error) {
    if (await hasConflicts(root)) return { conflict: true, output: error.message }
    throw error
  }
}

/** revert 一个提交（不打开编辑器）；冲突时返回 `{ conflict: true }`。 */
export async function revert(cwd, hash) {
  const root = await repoRoot(cwd)
  assertValidHash(hash)
  try {
    const out = await runGit(root, ['revert', '--no-edit', hash])
    return { conflict: false, output: out.trim() }
  } catch (error) {
    if (await hasConflicts(root)) return { conflict: true, output: error.message }
    throw error
  }
}

const RESET_MODES = new Set(['soft', 'mixed', 'hard'])

/** reset 到指定提交（mode: soft | mixed | hard）。 */
export async function reset(cwd, hash, mode = 'mixed') {
  const root = await repoRoot(cwd)
  assertValidHash(hash)
  if (!RESET_MODES.has(mode)) throw new GitError(`invalid reset mode: ${mode}`, 'validate-reset')
  await runGit(root, ['reset', `--${mode}`, hash])
  return currentBranch(root).catch(() => 'HEAD')
}

/** 删除远程分支（默认 origin）。 */
export async function deleteRemoteBranch(cwd, name, remote = 'origin') {
  const root = await repoRoot(cwd)
  assertValidRef(name, 'branch')
  assertRefArg(remote)
  await runGit(root, ['push', remote, '--delete', name])
}
