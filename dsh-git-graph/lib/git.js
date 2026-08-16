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
