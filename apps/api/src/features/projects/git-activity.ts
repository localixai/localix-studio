/**
 * A project's commit activity, read from its own local git history: no remote, no account, no key.
 * The Project overview draws it as a year of day cells, like a contribution graph: a count per day
 * for the grid, and the commits of one day only when that day is picked.
 */
import { z } from 'zod'

import type { GitRunner } from '../../lib/git-in'

const DAY_MS = 86_400_000
/** Fields and records are split by ASCII unit/record separators, which never appear in a subject. */
const UNIT = '\x1f'
const RECORD = '\x1e'
/** Commit times read for a year's counts: a number each, so a large history stays small. */
const DEFAULT_LIMIT = 200_000
/** The commits one day lists. */
const DAY_LIMIT = 500

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
  /** True when the history had more commits in range than the limit and was cut short. */
  truncated: z.boolean(),
  /** Commits per day, keyed `YYYY-MM-DD` in the asking person's time zone; empty days absent. */
  days: z.record(z.string(), z.number()),
})

export const gitDayResponseSchema = z.object({
  /** Newest first. */
  commits: z.array(gitActivityCommitSchema),
})

export type GitActivityCommit = z.infer<typeof gitActivityCommitSchema>
export type GitActivityResponse = z.infer<typeof gitActivityResponseSchema>
export type GitDayResponse = z.infer<typeof gitDayResponseSchema>

/** `YYYY-MM-DD` of an instant in `timeZone`; UTC when the runtime does not know the zone. */
function dayFormat(timeZone: string): (time: number) => string {
  const options = { year: 'numeric', month: '2-digit', day: '2-digit' } as const
  let format: Intl.DateTimeFormat
  try {
    format = new Intl.DateTimeFormat('en-CA', { ...options, timeZone })
  } catch {
    format = new Intl.DateTimeFormat('en-CA', { ...options, timeZone: 'UTC' })
  }
  return (time) => format.format(time)
}

/** How many commits each of the last `days` days has, reachable from HEAD. */
export async function readGitActivity(
  git: GitRunner,
  options: { now: number; days: number; timeZone: string; limit?: number },
): Promise<GitActivityResponse> {
  const inside = await git(['rev-parse', '--is-inside-work-tree'])
  if (inside?.trim() !== 'true') return { repository: false, truncated: false, days: {} }
  const limit = options.limit ?? DEFAULT_LIMIT
  const since = Math.floor((options.now - options.days * DAY_MS) / 1000)
  // One more than the limit, so a full page tells "exactly the limit" from "cut short".
  const out = await git(['log', `--since=@${since}`, `--max-count=${limit + 1}`, '--format=%at'])
  // A repository without a first commit has no HEAD, so `log` fails: an empty history.
  if (!out) return { repository: true, truncated: false, days: {} }
  const times = out
    .split('\n')
    .map((line) => Number(line.trim()))
    .filter((seconds) => Number.isFinite(seconds) && seconds > 0)
  const keyOf = dayFormat(options.timeZone)
  const days: Record<string, number> = {}
  for (const seconds of times.slice(0, limit)) {
    const key = keyOf(seconds * 1000)
    days[key] = (days[key] ?? 0) + 1
  }
  return { repository: true, truncated: times.length > limit, days }
}

function parseRecord(raw: string): GitActivityCommit | null {
  const [hash, seconds, author, subject] = raw.replace(/^\s+/, '').split(UNIT)
  const time = Number(seconds)
  if (!hash || !/^[0-9a-f]{7,64}$/i.test(hash) || !Number.isFinite(time)) return null
  return { hash, time: time * 1000, author: author ?? '', subject: subject ?? '' }
}

/** The commits authored in `[from, to)` (epoch milliseconds), newest first. */
export async function readGitDay(
  git: GitRunner,
  options: { from: number; to: number },
): Promise<GitDayResponse> {
  const out = await git([
    'log',
    `--since=@${Math.floor(options.from / 1000)}`,
    `--until=@${Math.ceil(options.to / 1000) - 1}`,
    `--max-count=${DAY_LIMIT}`,
    `--format=%H${UNIT}%at${UNIT}%an${UNIT}%s${RECORD}`,
  ])
  if (!out) return { commits: [] }
  return {
    commits: out
      .split(RECORD)
      .map(parseRecord)
      .filter((commit): commit is GitActivityCommit => commit !== null),
  }
}
