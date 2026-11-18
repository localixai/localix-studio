import { describe, expect, test } from 'bun:test'

import type { AppContext } from '../../app'
import type { GitRunner } from '../../lib/git-in'
import { readGitActivity } from './git-activity'

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

describe('readGitActivity', () => {
  test('lists the commits of the last year from the local history, newest first', async () => {
    const git = fakeGit({
      'rev-parse': 'true',
      log: [
        record('b'.repeat(40), 1_700_000_100, 'Ada', 'feat: second'),
        record('a'.repeat(40), 1_700_000_000, 'Grace', 'fix: first, with a | pipe'),
      ].join('\n'),
    })
    const activity = await readGitActivity(git, { now: 1_700_100_000_000, days: 365 })
    expect(activity).toEqual({
      repository: true,
      truncated: false,
      commits: [
        { hash: 'b'.repeat(40), time: 1_700_000_100_000, author: 'Ada', subject: 'feat: second' },
        {
          hash: 'a'.repeat(40),
          time: 1_700_000_000_000,
          author: 'Grace',
          subject: 'fix: first, with a | pipe',
        },
      ],
    })
    const log = git.calls.find((args) => args[0] === 'log') ?? []
    expect(log).toContain('--since=@' + Math.floor((1_700_100_000_000 - 365 * 86_400_000) / 1000))
  })

  test('a folder that is not a git repository has no activity and is said so', async () => {
    const git = fakeGit({ 'rev-parse': null })
    expect(await readGitActivity(git, { now: 0, days: 365 })).toEqual({
      repository: false,
      truncated: false,
      commits: [],
    })
    expect(git.calls.some((args) => args[0] === 'log')).toBe(false)
  })

  test('a repository with no commit yet reads as an empty history, not a failure', async () => {
    const git = fakeGit({ 'rev-parse': 'true', log: null })
    expect(await readGitActivity(git, { now: 0, days: 365 })).toEqual({
      repository: true,
      truncated: false,
      commits: [],
    })
  })

  test('stops at the cap and says the history was cut short', async () => {
    const lines = Array.from({ length: 3 }, (_, i) =>
      record(String(i).repeat(40), 1_700_000_000 - i, 'Ada', `c${i}`),
    )
    const git = fakeGit({ 'rev-parse': 'true', log: lines.join('\n') })
    const activity = await readGitActivity(git, { now: 1_700_100_000_000, days: 365, limit: 2 })
    expect(activity.truncated).toBe(true)
    expect(activity.commits.map((commit) => commit.subject)).toEqual(['c0', 'c1'])
  })

  test('skips a malformed record instead of failing the whole history', async () => {
    const git = fakeGit({
      'rev-parse': 'true',
      log: `garbage${RS}\n` + record('c'.repeat(40), 1_700_000_000, 'Ada', 'ok'),
    })
    const activity = await readGitActivity(git, { now: 1_700_100_000_000, days: 365 })
    expect(activity.commits.map((commit) => commit.subject)).toEqual(['ok'])
  })
})

describe('GET /rpc/projects/:id/git-activity', () => {
  test("answers the project's activity for the signed-in user", async () => {
    const { Hono } = await import('hono')
    const { createProjectsRoutes } = await import('./routes')
    const asked: string[] = []
    const service = {
      gitActivity: async (userId: string, id: string) => {
        asked.push(`${userId}/${id}`)
        return {
          repository: true,
          truncated: false,
          commits: [{ hash: 'a'.repeat(40), time: 1, author: 'Ada', subject: 'init' }],
        }
      },
    } as unknown as Parameters<typeof createProjectsRoutes>[0]
    const app = new Hono<AppContext>()
    app.use('*', async (c, next) => {
      c.set('userId', 'u1')
      await next()
    })
    app.route('/rpc/projects', createProjectsRoutes(service))
    const response = await app.request('/rpc/projects/p1/git-activity')
    expect(response.status).toBe(200)
    expect(((await response.json()) as { commits: unknown[] }).commits).toHaveLength(1)
    expect(asked).toEqual(['u1/p1'])
  })
})
