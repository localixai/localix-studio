import { createHash } from 'node:crypto'
import { homedir } from 'node:os'
import path from 'node:path'

import { expandHome } from '../../../lib/home-path'
import type { FileReadLog } from './file-read-failure'

import { localEnvironment } from '../../agent-core/tools/environments/local'
import { assertWorkspaceFolder } from '../../projects/workspace-folder'
import type { SessionRecord } from '../repository'

/**
 * The shared preamble every session file operation starts from. Owning it in one
 * place keeps the three operation families (content I/O, tree mutations, search)
 * independent of HOW a session resolves into an execution environment.
 */

/** Closure values the session file-browser operations need from createChatService. */
export interface FileOpsContext {
  requireSession: (userId: string, id: string) => Promise<SessionRecord>
  resolveSessionWorkingDir: (userId: string, session: SessionRecord) => Promise<string>
  /** The wall clock a snapshot is judged against; tests move it forward. */
  now?: () => number
  /** The home directory `~` names; the process's own unless a test gives one. */
  homeDir?: string
  /** Byte caps of a read (viewer, editor); the production ones unless a test gives small ones. */
  readCaps?: { view: number; edit: number }
  /** Where a read that failed for no reason the person can act on is recorded (`api.log`). */
  logger?: FileReadLog
}

/**
 * Shared per-op preamble: load the session, build its backend-aware execution
 * environment, and resolve its working dir. Every file operation starts from this
 * same triple, so this is where a project folder that was moved or deleted is refused
 * (409 `workspace_folder_*`, projects/workspace-folder.ts) instead of each operation
 * failing in its own words on a path that is not there.
 */
export const openSessionEnv = async (ctx: FileOpsContext, userId: string, sessionId: string) => {
  const session = await ctx.requireSession(userId, sessionId)
  const env = localEnvironment
  const dir = await ctx.resolveSessionWorkingDir(userId, session)
  await assertWorkspaceFolder(dir)
  return { session, env, dir }
}

/**
 * Resolve a possibly-relative path against the session's working dir. `~` and `~/…` are the home
 * directory, as a shell reads them: a reply that names `~/Desktop/logs.zip` means that file, and
 * joining it to the project folder pointed at `<project>/~/Desktop/logs.zip`, which never exists.
 */
export const resolveAgainst = (dir: string, p: string, home: string = homedir()): string => {
  const expanded = expandHome(p, home)
  return path.isAbsolute(expanded) ? expanded : path.resolve(dir, expanded)
}

/** sha256 hex of a UTF-8 string — the optimistic-concurrency token for edits. */
export const contentHash = (content: string): string =>
  createHash('sha256').update(content, 'utf8').digest('hex')
