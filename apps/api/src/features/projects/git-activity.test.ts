import { describe, expect, test } from 'bun:test'

import type { AppContext } from '../../app'
import type { GitRunner } from '../../lib/git-in'
import { readGitActivity, readGitDay } from './git-activity'

const US = '\x1f'
const RS = '\x1e'
const record = (hash: string, seconds: number, author: string, subject: string) =>
  [hash, String(seconds), author, subject].join(US) + RS

function fakeGit(answers: Record<string, string | null>): GitRunner & { calls: string[][] } {
  const calls: string[][] = []
  const run = async (args: string[]) => {
    calls.push(args)
    return answers[args[0] ?? ''] ?? null
  }
  return Object.assign(run, { calls })
}

// 2023-11-14T22:13:20Z: the 14th in London, already the 15th in Tokyo.
const LATE = 1_700_000_000

describe('readGitActivity', () => {
  test('counts the commits of each day in the person’s time zone, reading only their times', async () => {
    const git = fakeGit({
      'rev-parse': 'true',
      log: [LATE + 100, LATE, LATE - 86_400].join('\n'),
    })
    const now = (LATE + 86_400) * 1000
    expect(await readGitActivity(git, { now, days: 365, timeZone: 'Asia/Tokyo' })).toEqual({
      repository: true,
      truncated: false,
      days: { '2023-11-15': 2, '2023-11-14': 1 },
    })
    expect(await readGitActivity(git, { now, days: 365, timeZone: 'Europe/London' })).toEqual({
      repository: true,
      truncated: false,
      days: { '2023-11-14': 2, '2023-11-13': 1 },
    })
    const log = git.calls.find((args) => args[0] === 'log') ?? []
    expect(log).toContain('--format=%at')
    expect(log).toContain('--since=@' + Math.floor((now - 365 * 86_400_000) / 1000))
  })

  test('a time zone the runtime does not know counts in UTC rather than failing', async () => {
    const git = fakeGit({ 'rev-parse': 'true', log: String(LATE) })
    const activity = await readGitActivity(git, { now: 0, days: 365, timeZone: 'Nowhere/Else' })
    expect(activity.days).toEqual({ '2023-11-14': 1 })
  })

  test('a folder that is not a git repository has no activity and is said so', async () => {
    const git = fakeGit({ 'rev-parse': null })
    expect(await readGitActivity(git, { now: 0, days: 365, timeZone: 'UTC' })).toEqual({
      repository: false,
      truncated: false,
      days: {},
    })
    expect(git.calls.some((args) => args[0] === 'log')).toBe(false)
  })

  test('a repository with no commit yet reads as an empty history, not a failure', async () => {
    const git = fakeGit({ 'rev-parse': 'true', log: null })
    expect(await readGitActivity(git, { now: 0, days: 365, timeZone: 'UTC' })).toEqual({
      repository: true,
      truncated: false,
      days: {},
    })
  })

  test('stops at the cap and says the history was cut short', async () => {
    const git = fakeGit({ 'rev-parse': 'true', log: [LATE, LATE - 1, LATE - 2].join('\n') })
    const activity = await readGitActivity(git, { now: 0, days: 365, timeZone: 'UTC', limit: 2 })
    expect(activity).toEqual({ repository: true, truncated: true, days: { '2023-11-14': 2 } })
  })
})

describe('readGitDay', () => {
  test('lists the commits of one day, newest first, skipping a malformed record', async () => {
    const git = fakeGit({
      log: `garbage${RS}\n` + record('a'.repeat(40), LATE, 'Grace', 'fix: first, with a | pipe'),
    })
    const from = (LATE - 3600) * 1000
    const to = from + 86_400_000
    expect(await readGitDay(git, { from, to })).toEqual({
      commits: [
        {
          hash: 'a'.repeat(40),
          time: LATE * 1000,
          author: 'Grace',
          subject: 'fix: first, with a | pipe',
        },
      ],
    })
    const log = git.calls[0] ?? []
    expect(log).toContain(`--since=@${from / 1000}`)
    expect(log).toContain(`--until=@${to / 1000 - 1}`)
  })
})

describe('GET /rpc/projects/:id/git-activity', () => {
  test('answers counts for the time zone asked, and one day’s commits on request', async () => {
    const { Hono } = await import('hono')
    const { createProjectsRoutes } = await import('./routes')
    const asked: string[] = []
    const service = {
      gitActivity: async (userId: string, id: string, timeZone: string) => {
        asked.push(`${userId}/${id}@${timeZone}`)
        return { repository: true, truncated: false, days: { '2023-11-14': 3 } }
      },
      gitDay: async (userId: string, id: string, from: number, to: number) => {
        asked.push(`${userId}/${id}:${from}-${to}`)
        return { commits: [{ hash: 'a'.repeat(40), time: 1, author: 'Ada', subject: 'init' }] }
      },
    } as unknown as Parameters<typeof createProjectsRoutes>[0]
    const app = new Hono<AppContext>()
    app.use('*', async (c, next) => {
      c.set('userId', 'u1')
      await next()
    })
    app.route('/rpc/projects', createProjectsRoutes(service))
    const year = await app.request('/rpc/projects/p1/git-activity?timeZone=Asia%2FTokyo')
    expect(year.status).toBe(200)
    expect(((await year.json()) as { days: unknown }).days).toEqual({ '2023-11-14': 3 })
    const day = await app.request('/rpc/projects/p1/git-activity/day?from=1000&to=2000')
    expect(((await day.json()) as { commits: unknown[] }).commits).toHaveLength(1)
    expect(asked).toEqual(['u1/p1@Asia/Tokyo', 'u1/p1:1000-2000'])
  })
})
