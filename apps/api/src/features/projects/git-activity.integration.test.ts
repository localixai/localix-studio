import { expect, test } from 'bun:test'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { runSync, scratchGitEnv, tempDirPerTest } from '@localixai/testing'

import { readGitActivity, readGitDay } from './git-activity'
import type { GitRunner } from '../../lib/git-in'

const dir = tempDirPerTest('git-activity-')

/** The same runner `gitIn` builds, with the scratch identity a test repository needs. */
const gitAt =
  (cwd: string): GitRunner =>
  async (args) => {
    const result = runSync('git', ['-C', cwd, ...args], { env: scratchGitEnv() })
    return result.code === 0 ? result.stdout.replace(/\s+$/, '') : null
  }

test('reads the commits of a real repository and nothing from a plain folder', async () => {
  const repo = path.join(dir(), 'repo')
  const plain = path.join(dir(), 'plain')
  mkdirSync(repo, { recursive: true })
  mkdirSync(plain, { recursive: true })
  const env = scratchGitEnv()
  expect(runSync('git', ['init', '--quiet'], { cwd: repo, env }).code).toBe(0)
  for (const subject of ['first', 'second']) {
    writeFileSync(path.join(repo, `${subject}.txt`), subject)
    expect(runSync('git', ['add', '.'], { cwd: repo, env }).code).toBe(0)
    expect(runSync('git', ['commit', '--quiet', '-m', subject], { cwd: repo, env }).code).toBe(0)
  }
  const now = Date.now() + 60_000
  const activity = await readGitActivity(gitAt(repo), { now, days: 365, timeZone: 'UTC' })
  expect(activity.repository).toBe(true)
  expect(Object.values(activity.days).reduce((sum, count) => sum + count, 0)).toBe(2)
  const day = await readGitDay(gitAt(repo), { from: now - 3_600_000, to: now })
  expect(day.commits.map((commit) => commit.subject)).toEqual(['second', 'first'])
  const plainActivity = await readGitActivity(gitAt(plain), { now, days: 365, timeZone: 'UTC' })
  expect(plainActivity).toMatchObject({
    repository: false,
  })
})
