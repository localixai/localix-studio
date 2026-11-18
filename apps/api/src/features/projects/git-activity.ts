/**
 * A project's commit activity, read from its own local git history: no remote, no account, no key.
 * The Project overview draws it as a year of day cells, like a contribution graph.
 */
import { z } from 'zod'

import type { GitRunner } from '../../lib/git-in'

const DAY_MS = 86_400_000
/** Fields and records are split by ASCII unit/record separators, which never appear in a subject. */
const UNIT = '\x1f'
const RECORD = '\x1e'
const DEFAULT_LIMIT = 20_000

export const gitActivityCommitSchema = z.object({
  hash: z.string(),
  /** Author time, epoch milliseconds. */
  time: z.number(),
  author: z.string(),
  subject: z.string(),
})

export const gitActivityResponseSchema = z.object({
  /** False when the project folder is not inside a git repository. */
  repository: z.boolean(),
  /** True when the history had more commits in range than `limit` and was cut short. */
  truncated: z.boolean(),
  /** Newest first. */
  commits: z.array(gitActivityCommitSchema),
})

export type GitActivityCommit = z.infer<typeof gitActivityCommitSchema>
export type GitActivityResponse = z.infer<typeof gitActivityResponseSchema>

function parseRecord(raw: string): GitActivityCommit | null {
  const [hash, seconds, author, subject] = raw.replace(/^\s+/, '').split(UNIT)
  const time = Number(seconds)
  if (!hash || !/^[0-9a-f]{7,64}$/i.test(hash) || !Number.isFinite(time)) return null
  return { hash, time: time * 1000, author: author ?? '', subject: subject ?? '' }
}

/** The commits of the last `days` days reachable from HEAD, newest first. */
export async function readGitActivity(
  git: GitRunner,
  options: { now: number; days: number; limit?: number },
): Promise<GitActivityResponse> {
  const inside = await git(['rev-parse', '--is-inside-work-tree'])
  if (inside?.trim() !== 'true') return { repository: false, truncated: false, commits: [] }
  const limit = options.limit ?? DEFAULT_LIMIT
  const since = Math.floor((options.now - options.days * DAY_MS) / 1000)
  // One more than the limit, so a full page tells "exactly the limit" from "cut short".
  const out = await git([
    'log',
    `--since=@${since}`,
    `--max-count=${limit + 1}`,
    `--format=%H${UNIT}%at${UNIT}%an${UNIT}%s${RECORD}`,
  ])
  // A repository without a first commit has no HEAD, so `log` fails: an empty history.
  if (!out) return { repository: true, truncated: false, commits: [] }
  const commits = out
    .split(RECORD)
    .map(parseRecord)
    .filter((commit): commit is GitActivityCommit => commit !== null)
  return {
    repository: true,
    truncated: commits.length > limit,
    commits: commits.slice(0, limit),
  }
}
