import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import { InvalidRequestError } from '../../lib/domain-errors'
import { errorMessage } from '../../lib/errors'
import { childEnvNonInteractive } from '../../lib/login-shell-env'
import { rmrf } from '../ext/install-tree'
import { withoutRepoLocation } from '../../lib/git-in'
import { readGitRemoteEnvironment } from './kit'

const execFileAsync = promisify(execFile)

/** Where a git checkout lands: a branch, tag or commit, and optionally one subdirectory. */
export interface GitCheckoutTarget {
  /** A branch, a tag, or a commit SHA (full or abbreviated). Absent: the default branch. */
  ref?: string
  /**
   * Check out only this directory (Claude Code's `git-subdir` sparse checkout), or these paths (a
   * marketplace's `sparsePaths`).
   */
  sparse?: string | string[]
}

const GIT_TIMEOUT_MS = 120_000

/** The person's environment without the variables that point git at another repository. */
const localGitEnv = () => withoutRepoLocation(childEnvNonInteractive())

async function git(args: string[], cwd?: string, env = localGitEnv()): Promise<string> {
  // Never prompt: a host without stored credentials fails instead of waiting for a password.
  // The fetch owns `dest`: nothing a hook exported may point it at another repository.
  const { stdout } = await execFileAsync('git', args, {
    cwd,
    timeout: GIT_TIMEOUT_MS,
    env,
    windowsHide: true,
  })
  return String(stdout)
}

/**
 * The commit a checkout Localix made is at, or undefined. Only the checkout's own `.git` is read,
 * never a repository that encloses it (Claude Code does not take a version from one either).
 */
export async function readHeadCommit(dir: string): Promise<string | undefined> {
  if (!(await fs.stat(join(dir, '.git')).catch(() => null))) return undefined
  try {
    const sha = (await git(['rev-parse', 'HEAD'], dir)).trim()
    return /^[0-9a-f]{40}$/i.test(sha) ? sha : undefined
  } catch {
    return undefined
  }
}

/**
 * Fetch one revision of `url` into `dest`, as Claude Code does for a plugin source. A commit SHA
 * is fetched directly (most hosts serve a reachable commit even when its branch is gone); a
 * server that refuses a SHA, or an abbreviated one, falls back to fetching every branch and tag
 * and checking the commit out. With `sparse`, only that directory is checked out, over a partial
 * clone where the host supports one, so a plugin in a monorepo skips the rest of the repository.
 */
export async function fetchGitTree(
  url: string,
  dest: string,
  target: GitCheckoutTarget = {},
): Promise<void> {
  try {
    // The remote is reached as the kit plans a clone: no prompt, and an unknown SSH host refused.
    const remote = await readGitRemoteEnvironment(localGitEnv())
    await rmrf(dest)
    await fs.mkdir(dest, { recursive: true })
    await git(['init', '--quiet', dest])
    await git(['remote', 'add', 'origin', url], dest)
    const filter = target.sparse ? ['--filter=blob:none'] : []
    if (target.sparse) {
      await git(['config', 'remote.origin.promisor', 'true'], dest)
      await git(['config', 'remote.origin.partialclonefilter', 'blob:none'], dest)
      const paths = Array.isArray(target.sparse) ? target.sparse : [target.sparse]
      await git(['sparse-checkout', 'set', '--', ...paths], dest)
    }
    const want = target.ref ?? 'HEAD'
    try {
      await git(['fetch', '--quiet', '--depth', '1', ...filter, 'origin', want], dest, remote)
      await git(['checkout', '--quiet', 'FETCH_HEAD'], dest, remote)
    } catch (shallow) {
      if (!target.ref) throw shallow
      await git(
        [
          'fetch',
          '--quiet',
          ...filter,
          'origin',
          '+refs/heads/*:refs/remotes/origin/*',
          '+refs/tags/*:refs/tags/*',
        ],
        dest,
        remote,
      )
      await git(['checkout', '--quiet', target.ref], dest, remote)
    }
  } catch (err) {
    await rmrf(dest)
    throw new InvalidRequestError('plugin_clone_failed', `git fetch failed: ${errorMessage(err)}`)
  }
}
